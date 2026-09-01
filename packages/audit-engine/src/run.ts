import { z } from 'zod'
import { CHECK_RUNNERS } from './checks'
import { createCheckContext } from './context'
import { checksForCategory, isQueuedCheck } from './registry'
import { businessSnapshotSchema, checkIdSchema, checkResult, checkResultSchema } from './schemas'
import type { AuditEngineEnv, BusinessSnapshot, CheckId, CheckResult } from './types'
import type { FetchWebsiteOptions } from './browser'

export interface RunChecksOptions extends FetchWebsiteOptions {
  env?: AuditEngineEnv
  includeQueued?: boolean
}

export async function runCheck(
  id: CheckId,
  business: BusinessSnapshot,
  options: RunChecksOptions = {},
): Promise<CheckResult> {
  const parsedId = checkIdSchema.parse(id)
  const parsedBusiness = businessSnapshotSchema.parse(business)
  const ctx = createCheckContext(parsedBusiness, options.env ?? {}, options)
  try {
    return await CHECK_RUNNERS[parsedId](ctx)
  } catch (error) {
    return checkResult(false, error instanceof Error ? error.message : 'Unknown error')
  }
}

export async function runChecks(
  business: BusinessSnapshot,
  checkIds: CheckId[] | undefined,
  options: RunChecksOptions = {},
): Promise<Partial<Record<CheckId, CheckResult>>> {
  const parsedBusiness = businessSnapshotSchema.parse(business)
  const requested = checkIds && checkIds.length > 0
    ? checkIds.map((id) => checkIdSchema.parse(id))
    : checksForCategory(parsedBusiness.category).map((check) => check.id)

  const selected = options.includeQueued === false
    ? requested.filter((id) => !isQueuedCheck(id))
    : requested

  const ctx = createCheckContext(parsedBusiness, options.env ?? {}, options)
  const results: Record<string, CheckResult> = {}
  await Promise.all(selected.map(async (id) => {
    try {
      results[id] = await CHECK_RUNNERS[id](ctx)
    } catch (error) {
      results[id] = checkResult(false, error instanceof Error ? error.message : 'Unknown error')
    }
  }))

  return z.record(checkIdSchema, checkResultSchema).parse(results) satisfies Partial<Record<CheckId, CheckResult>>
}

export function splitQueuedChecks(checkIds: CheckId[]): { immediate: CheckId[]; queued: CheckId[] } {
  const immediate: CheckId[] = []
  const queued: CheckId[] = []
  for (const id of checkIds) {
    if (isQueuedCheck(id)) queued.push(id)
    else immediate.push(id)
  }
  return { immediate, queued }
}
