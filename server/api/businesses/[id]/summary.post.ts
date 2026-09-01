import { z } from 'zod'

const summaryRequestSchema = z.object({
  checks: z.array(completedCheckSchema),
})

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string() }).parse)
  const body = await readValidatedBody(event, summaryRequestSchema.parse)

  const db = useDrizzle()
  const business = await db.query.businesses.findFirst({
    where: eq(tables.businesses.id, id),
  })

  if (!business) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Business not found',
    })
  }

  const cloudflareEnv = z.object({
    AI: z.unknown().optional(),
  }).passthrough().safeParse(event.context.cloudflare?.env)

  let hubAiClient: unknown = null
  try {
    hubAiClient = hubAI()
  }
  catch {
    hubAiClient = null
  }

  const ai = resolveWorkersAiBinding(
    cloudflareEnv.success ? cloudflareEnv.data.AI : null,
    Reflect.get(process.env, 'AI'),
    hubAiClient,
  )

  return summarizeAuditChecks({
    businessName: business.name,
    checks: body.checks,
    ai,
  })
})
