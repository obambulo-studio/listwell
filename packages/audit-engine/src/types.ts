import type { z } from 'zod'
import type {
  businessCategorySchema,
  businessSnapshotSchema,
  checkIdSchema,
  checkResultSchema,
  channelCategorySchema,
} from './schemas'

export type CheckId = z.infer<typeof checkIdSchema>
export type BusinessCategory = z.infer<typeof businessCategorySchema>
export type ChannelCategory = z.infer<typeof channelCategorySchema>
export type BusinessSnapshot = z.infer<typeof businessSnapshotSchema>
export type CheckResult = z.infer<typeof checkResultSchema>

export type CheckStatus = 'idle' | 'pending' | 'pass' | 'fail' | 'error'

export interface CheckDefinition {
  id: CheckId
  channelCategory: ChannelCategory
  points: Record<BusinessCategory, number>
  businessCategories: BusinessCategory[] | null
  queued: boolean
}

export interface LocationParts {
  suburb: string | null
  city: string | null
  state: string | null
  country: string | null
  locationParts: string[]
}

export interface GooglePlace {
  id?: string
  displayName?: { text: string }
  nationalPhoneNumber?: string
  currentOpeningHours?: unknown
  websiteUri?: string
  userRatingCount?: number
  formattedAddress?: string
  rating?: number
  photos?: unknown[]
  types?: string[]
  addressComponents?: Array<{
    longText?: string
    shortText?: string
    types?: string[]
  }>
}

export interface SerializedHttpResponse {
  status: number
  statusText: string
  url: string
  ok: boolean
  headers: Record<string, string>
  body: string
}

export interface GoogleSearchResult {
  title: string
  link: string
  description: string
}

export interface SocialSearchHit {
  url: string
  title: string
  score: number
  username?: string
  occurrences?: number
}

export type JobStatus = 'queued' | 'running' | 'complete' | 'error'

export interface AuditJob {
  id: string
  status: JobStatus
  checkIds: CheckId[]
  results: Partial<Record<CheckId, CheckResult>>
  error?: string
  createdAt: number
  updatedAt: number
}

export interface QueueAuditMessage {
  jobId: string
  business: BusinessSnapshot
  checkIds: CheckId[]
}

export interface AuditEngineEnv {
  googleApiKey?: string
  googleProgrammableSearchEngineId?: string
  appleMapkitTeamId?: string
  appleMapkitKeyId?: string
  appleMapkitPrivateKey?: string
  cloudflareAccountId?: string
  cloudflareApiToken?: string
}
