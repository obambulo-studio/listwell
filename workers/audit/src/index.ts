import {
  businessSnapshotSchema,
  checkIdSchema,
  checksForCategory,
  createQueueMessage,
  parseQueueMessage,
  runChecks,
  runChecksRequestSchema,
  searchAppleMaps,
  fetchApplePlace,
  fetchGooglePlace,
  googleSearch,
  searchSocial,
  splitQueuedChecks,
} from '@listwell/audit-engine'
import type { AuditEngineEnv, AuditJob, BusinessSnapshot, CheckId, QueueAuditMessage } from '@listwell/audit-engine'

interface WorkerEnv {
  AUDIT_KV: KVNamespace
  AUDIT_QUEUE?: Queue<QueueAuditMessage>
  BROWSER?: unknown
  GOOGLE_API_KEY?: string
  GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID?: string
  APPLE_MAPKIT_TEAM_ID?: string
  APPLE_MAPKIT_KEY_ID?: string
  APPLE_MAPKIT_PRIVATE_KEY?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
}

function engineEnv(env: WorkerEnv): AuditEngineEnv {
  return {
    googleApiKey: env.GOOGLE_API_KEY,
    googleProgrammableSearchEngineId: env.GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID,
    appleMapkitTeamId: env.APPLE_MAPKIT_TEAM_ID,
    appleMapkitKeyId: env.APPLE_MAPKIT_KEY_ID,
    appleMapkitPrivateKey: env.APPLE_MAPKIT_PRIVATE_KEY,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  })
}

function notFound(): Response {
  return json({ error: 'Not found' }, 404)
}

async function readJob(env: WorkerEnv, jobId: string): Promise<AuditJob | null> {
  const raw = await env.AUDIT_KV.get(`job:${jobId}`, 'json')
  if (!raw || typeof raw !== 'object') return null
  return raw
}

async function writeJob(env: WorkerEnv, job: AuditJob): Promise<void> {
  await env.AUDIT_KV.put(`job:${jobId(job)}`, JSON.stringify(job), { expirationTtl: 60 * 60 * 24 })
}

function jobId(job: AuditJob): string {
  return job.id
}

function newJobId(): string {
  return crypto.randomUUID()
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      })
    }

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    try {
      if (request.method === 'GET' && path === '/health') {
        return json({ ok: true, service: 'listwell-audit' })
      }

      if (request.method === 'POST' && path === '/v1/checks') {
        return await handleRunChecks(request, env)
      }

      if (request.method === 'GET' && path.startsWith('/v1/jobs/')) {
        const id = path.slice('/v1/jobs/'.length)
        const job = await readJob(env, id)
        return job ? json(job) : notFound()
      }

      if (request.method === 'GET' && path === '/v1/lookups/google/places') {
        const id = url.searchParams.get('id')
        if (!id || !env.GOOGLE_API_KEY) return json({ error: 'Missing place id or Google API key' }, 400)
        return json(await fetchGooglePlace(id, env.GOOGLE_API_KEY))
      }

      if (request.method === 'GET' && path === '/v1/lookups/google/search') {
        const query = url.searchParams.get('query')
        if (!query) return json({ error: 'Missing query' }, 400)
        return json(await googleSearch(query, engineEnv(env)))
      }

      if (request.method === 'GET' && path === '/v1/lookups/apple/search') {
        const query = url.searchParams.get('query')
        if (!query) return json({ error: 'Missing query' }, 400)
        return json(await searchAppleMaps(query, engineEnv(env), fetch, url.searchParams.get('userLocation') ?? undefined))
      }

      if (request.method === 'GET' && path.startsWith('/v1/lookups/apple/places/')) {
        const id = path.slice('/v1/lookups/apple/places/'.length)
        return json(await fetchApplePlace(id, engineEnv(env)))
      }

      if (request.method === 'GET' && path.startsWith('/v1/lookups/social/')) {
        const platform = path.slice('/v1/lookups/social/'.length)
        const query = url.searchParams.get('query')
        if (!query) return json({ error: 'Missing query' }, 400)
        if (
          platform !== 'facebook'
          && platform !== 'instagram'
          && platform !== 'tiktok'
          && platform !== 'linkedin'
          && platform !== 'youtube'
          && platform !== 'x'
        ) {
          return json({ error: 'Unknown social platform' }, 400)
        }
        return json(await searchSocial(platform, query, (q) => googleSearch(q, engineEnv(env))))
      }

      return notFound()
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
    }
  },

  async queue(batch: MessageBatch<QueueAuditMessage>, env: WorkerEnv): Promise<void> {
    for (const message of batch.messages) {
      const payload = parseQueueMessage(message.body)
      const job = await readJob(env, payload.jobId)
      if (job) {
        job.status = 'running'
        job.updatedAt = Date.now()
        await writeJob(env, job)
      }

      try {
        const results = await runChecks(payload.business, payload.checkIds, {
          env: engineEnv(env),
          includeQueued: true,
        })
        const next: AuditJob = job ?? {
          id: payload.jobId,
          status: 'complete',
          checkIds: payload.checkIds,
          results: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        next.results = { ...next.results, ...results }
        next.status = 'complete'
        next.updatedAt = Date.now()
        await writeJob(env, next)
        message.ack()
      } catch (error) {
        if (job) {
          job.status = 'error'
          job.error = error instanceof Error ? error.message : 'Unknown error'
          job.updatedAt = Date.now()
          await writeJob(env, job)
        }
        message.retry()
      }
    }
  },
}

async function handleRunChecks(request: Request, env: WorkerEnv): Promise<Response> {
  const body: unknown = await request.json()
  const parsed = runChecksRequestSchema.parse(body)
  const business: BusinessSnapshot = businessSnapshotSchema.parse(parsed.business)
  const requested: CheckId[] = parsed.checks && parsed.checks.length > 0
    ? parsed.checks.map((id) => checkIdSchema.parse(id))
    : checksForCategory(business.category).map((check) => check.id)

  const { immediate, queued } = splitQueuedChecks(requested)
  const canQueue = Boolean(env.AUDIT_QUEUE) && parsed.mode !== 'sync'

  const results = await runChecks(business, canQueue ? immediate : requested, {
    env: engineEnv(env),
    includeQueued: !canQueue,
  })

  if (!canQueue || queued.length === 0) {
    return json({ status: 'complete', results, pending: [] })
  }

  const id = newJobId()
  const job: AuditJob = {
    id,
    status: 'queued',
    checkIds: requested,
    results,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await writeJob(env, job)
  await env.AUDIT_QUEUE?.send(createQueueMessage({
    jobId: id,
    business,
    checkIds: queued,
  }))

  return json({
    status: 'queued',
    jobId: id,
    results,
    pending: queued,
  }, 202)
}
