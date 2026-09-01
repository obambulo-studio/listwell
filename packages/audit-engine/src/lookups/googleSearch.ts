import { z } from 'zod'
import { googleSearchResultSchema } from '../schemas'
import type { AuditEngineEnv, GoogleSearchResult } from '../types'

const searchQuerySchema = z.string().min(3)

const customSearchSchema = z.object({
  items: z.array(z.object({
    title: z.string().optional(),
    link: z.string().optional(),
    snippet: z.string().optional(),
  })).optional(),
})

export async function googleSearch(
  query: string,
  env: AuditEngineEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleSearchResult[]> {
  const validQuery = searchQuerySchema.parse(query)
  if (!env.googleApiKey || !env.googleProgrammableSearchEngineId) {
    return []
  }

  const apiUrl = `https://customsearch.googleapis.com/customsearch/v1?key=${env.googleApiKey}&cx=${env.googleProgrammableSearchEngineId}&q=${encodeURIComponent(validQuery)}&gl=au`
  const response = await fetchImpl(apiUrl)
  if (!response.ok) return []

  const parsed = customSearchSchema.safeParse(await response.json())
  if (!parsed.success) return []

  return (parsed.data.items ?? []).map((item) => googleSearchResultSchema.parse({
    title: item.title ?? '',
    link: item.link ?? '',
    description: item.snippet ?? '',
  }))
}
