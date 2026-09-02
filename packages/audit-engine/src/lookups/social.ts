import type { HtmlDocument } from '../html'
import type { GoogleSearchResult, SocialSearchHit } from '../types'

function titleScore(title: string, searchQuery: string, suffixes: RegExp[]): number {
  const normalizedQuery = searchQuery.toLowerCase().trim()
  let cleanTitle = title.toLowerCase().trim()
  for (const suffix of suffixes) {
    cleanTitle = cleanTitle.replace(suffix, '')
  }
  cleanTitle = cleanTitle.trim()

  if (cleanTitle === normalizedQuery) return 1
  if (cleanTitle.includes(normalizedQuery)) {
    return cleanTitle.startsWith(normalizedQuery) || cleanTitle.endsWith(normalizedQuery) ? 0.9 : 0.8
  }

  const queryWords = normalizedQuery.split(/\s+/).filter((word) => word.length > 2)
  const titleWords = cleanTitle.split(/\s+/)
  if (queryWords.length === 0) return 0

  let exactWordMatches = 0
  let partialWordMatches = 0
  for (const queryWord of queryWords) {
    if (titleWords.includes(queryWord)) exactWordMatches += 1
    else if (titleWords.some((word) => word.includes(queryWord) || queryWord.includes(word))) {
      partialWordMatches += 1
    }
  }

  return (exactWordMatches / queryWords.length) * 0.7 + (partialWordMatches / queryWords.length) * 0.3
}

function usernameScore(username: string, searchQuery: string): number {
  const normalizedUsername = username.toLowerCase()
  const normalizedQuery = searchQuery.toLowerCase().replace(/\s+/g, '')
  if (normalizedUsername === normalizedQuery) return 1
  if (normalizedUsername.includes(normalizedQuery)) return 0.9

  const queryWords = searchQuery.toLowerCase().split(/\s+/).filter((word) => word.length > 2)
  if (queryWords.length === 0) return 0
  const matchingWords = queryWords.filter((word) => normalizedUsername.includes(word)).length
  return (matchingWords / queryWords.length) * 0.8
}

function rankScore(index: number): number {
  return Math.max(0, 1 - index * 0.1)
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function extractFacebookPage(url: string): { url: string; pageId: string | null; urlType: string } | null {
  const urlObj = safeUrl(url)
  if (!urlObj || !urlObj.hostname.includes('facebook.com')) return null

  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const firstPart = pathParts[0]
  if (!firstPart) return null
  if (firstPart.includes('story.php') || firstPart.includes('photo.php')) return null
  if (firstPart.includes('profile.php')) {
    const idParam = urlObj.searchParams.get('id')
    if (idParam && /^\d+$/.test(idParam)) {
      return { url: `https://www.facebook.com/profile.php?id=${idParam}`, pageId: idParam, urlType: 'profile' }
    }
    return null
  }
  if (['groups', 'events', 'marketplace', 'watch', 'gaming'].includes(firstPart)) return null
  if (firstPart === 'p' && pathParts[1]) {
    const pageIdMatch = pathParts[1].match(/-(\d+)$/)
    return {
      url: `https://www.facebook.com/p/${pathParts[1]}/`,
      pageId: pageIdMatch?.[1] ?? null,
      urlType: 'p-format',
    }
  }
  if (firstPart === 'pages' && pathParts.length >= 3) {
    const pageId = pathParts[pathParts.length - 1]
    if (pageId && /^\d+$/.test(pageId)) {
      return { url: `https://www.facebook.com/pages/${pathParts.slice(1).join('/')}/`, pageId, urlType: 'pages' }
    }
    return null
  }
  if (/^\d+$/.test(firstPart)) {
    return { url: `https://www.facebook.com/${firstPart}/`, pageId: firstPart, urlType: 'numeric' }
  }
  if (!firstPart.includes('.php') && !firstPart.includes('?') && !firstPart.includes('=')) {
    return { url: `https://www.facebook.com/${firstPart}/`, pageId: null, urlType: 'vanity' }
  }
  return null
}

export function rankFacebookPages(results: GoogleSearchResult[], query: string): SocialSearchHit[] {
  const groups = new Map<string, { url: string; title: string; titleScore: number; urlScore: number; occurrences: number; rank: number }>()

  results.forEach((result, index) => {
    const page = extractFacebookPage(result.link)
    if (!page) return
    const tScore = titleScore(result.title, query, [])
    const pathName = new URL(page.url).pathname.split('/').filter(Boolean)[0] ?? ''
    const uScore = usernameScore(pathName.replace(/-/g, ''), query) * (page.urlType === 'vanity' ? 1.2 : 1)
    const key = page.pageId ?? page.url
    const existing = groups.get(key)
    if (existing) {
      existing.occurrences += 1
      if (tScore > existing.titleScore) {
        existing.title = result.title
        existing.titleScore = tScore
      }
      if (uScore > existing.urlScore) {
        existing.url = page.url
        existing.urlScore = uScore
      }
      existing.rank = Math.min(existing.rank, index)
    } else {
      groups.set(key, {
        url: page.url,
        title: result.title,
        titleScore: tScore,
        urlScore: uScore,
        occurrences: 1,
        rank: index,
      })
    }
  })

  return [...groups.values()]
    .map((group) => {
      const occurrenceScore = Math.min(group.occurrences / 5, 1)
      const googleWeight = group.titleScore >= 0.9 ? 0.45 : 0.25
      const score = group.titleScore * (group.titleScore >= 0.9 ? 0.3 : 0.35)
        + group.urlScore * (group.titleScore >= 0.9 ? 0.15 : 0.25)
        + occurrenceScore * (group.titleScore >= 0.9 ? 0.1 : 0.15)
        + rankScore(group.rank) * googleWeight
      return { url: group.url, title: group.title, score, occurrences: group.occurrences }
    })
    .filter((result) => result.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export function extractInstagramProfile(url: string): { url: string; username: string } | null {
  const urlObj = safeUrl(url)
  if (!urlObj || !urlObj.hostname.includes('instagram.com')) return null
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const firstPart = pathParts[0]
  if (!firstPart) return null
  if (['p', 'reel', 'stories', 'tv', 'explore', 'accounts'].includes(firstPart)) return null
  if (firstPart.includes('.') || firstPart.includes('?') || firstPart.includes('=') || /^\d+$/.test(firstPart)) return null
  return { url: `https://www.instagram.com/${firstPart}/`, username: firstPart }
}

export function rankInstagramProfiles(results: GoogleSearchResult[], query: string): SocialSearchHit[] {
  return rankUsernameProfiles(results, query, extractInstagramProfile, [
    /\s*\(\s*@[^)]+\)\s*$/,
    /\s*•\s*instagram.*$/,
    /\s*-\s*instagram.*$/,
  ], 0.25, 0.4)
}

export function extractTikTokProfile(url: string): { url: string; username: string } | null {
  const urlObj = safeUrl(url)
  if (!urlObj || !urlObj.hostname.includes('tiktok.com')) return null
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const firstPart = pathParts[0]
  if (!firstPart || ['discover', 'tag', 'video', 't', 'legal', 'about', 'music', 'effect'].includes(firstPart)) return null
  if (!firstPart.startsWith('@')) return null
  const username = firstPart.slice(1)
  return { url: `https://www.tiktok.com/@${username}`, username }
}

export function rankTikTokProfiles(results: GoogleSearchResult[], query: string): SocialSearchHit[] {
  return rankUsernameProfiles(results, query, extractTikTokProfile, [
    /\s*\|\s*tiktok.*$/,
    /\s*-\s*tiktok.*$/,
    /\s*\(\s*@[^)]+\)\s*.*$/,
    /\s*on\s+tiktok.*$/,
  ], 0.25, 0.45)
}

export function extractYouTubeChannel(url: string): { url: string; handle?: string; channelId?: string } | null {
  const urlObj = safeUrl(url)
  if (!urlObj || (!urlObj.hostname.includes('youtube.com') && !urlObj.hostname.includes('youtu.be'))) return null
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const firstPart = pathParts[0]
  if (!firstPart || ['watch', 'playlist', 'shorts', 'live', 'feed', 'results'].includes(firstPart)) return null
  if (firstPart === 'channel' && pathParts[1]) {
    return { url: `https://www.youtube.com/channel/${pathParts[1]}`, channelId: pathParts[1] }
  }
  if ((firstPart === 'c' || firstPart === 'user') && pathParts[1]) {
    return { url: `https://www.youtube.com/${firstPart}/${pathParts[1]}`, handle: pathParts[1] }
  }
  if (firstPart.startsWith('@')) {
    const handle = firstPart.slice(1)
    return { url: `https://www.youtube.com/@${handle}`, handle }
  }
  if (!firstPart.includes('.') && !firstPart.includes('?')) {
    return { url: `https://www.youtube.com/${firstPart}`, handle: firstPart }
  }
  return null
}

export function rankYouTubeChannels(results: GoogleSearchResult[], query: string): SocialSearchHit[] {
  return rankUsernameProfiles(
    results,
    query,
    (url) => {
      const extracted = extractYouTubeChannel(url)
      if (!extracted) return null
      return { url: extracted.url, username: extracted.handle ?? extracted.channelId ?? extracted.url }
    },
    [/\s*-\s*youtube.*$/i, /\s*\|\s*youtube.*$/i, /\s*on\s+youtube.*$/i],
    0.3,
    0.35,
  )
}

export function extractLinkedInProfile(url: string): { url: string; identifier: string; profileType: 'company' | 'personal' } | null {
  const urlObj = safeUrl(url)
  if (!urlObj || !urlObj.hostname.includes('linkedin.com')) return null
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const firstPart = pathParts[0]
  if (!firstPart || ['learning', 'jobs', 'feed', 'groups', 'events', 'messaging', 'search', 'help', 'legal', 'about', 'business'].includes(firstPart)) {
    return null
  }
  if (firstPart === 'company' && pathParts[1]) {
    return { url: `https://www.linkedin.com/company/${pathParts[1]}`, identifier: pathParts[1], profileType: 'company' }
  }
  if (firstPart === 'in' && pathParts[1]) {
    return { url: `https://www.linkedin.com/in/${pathParts[1]}`, identifier: pathParts[1], profileType: 'personal' }
  }
  if (firstPart === 'pub' && pathParts.length >= 2) {
    const identifier = pathParts.slice(1).join('/')
    return { url: `https://www.linkedin.com/pub/${identifier}`, identifier, profileType: 'personal' }
  }
  return null
}

export function rankLinkedInProfiles(results: GoogleSearchResult[], query: string): SocialSearchHit[] {
  const hits: SocialSearchHit[] = []
  for (const result of results) {
    const profile = extractLinkedInProfile(result.link)
    if (!profile) continue
    const tScore = titleScore(result.title, query, [])
    const typeBonus = profile.profileType === 'company' ? 0.2 : 0.1
    const score = Math.min(tScore + typeBonus, 1)
    if (score >= 0.3) {
      hits.push({ url: profile.url, title: result.title, score, username: profile.identifier })
    }
  }
  const unique = new Map<string, SocialSearchHit>()
  for (const hit of hits) {
    const existing = unique.get(hit.url)
    if (!existing || hit.score > existing.score) unique.set(hit.url, hit)
  }
  return [...unique.values()].sort((a, b) => b.score - a.score)
}

export function extractTwitterProfile(url: string): { url: string; username: string } | null {
  const urlObj = safeUrl(url)
  if (!urlObj || (!urlObj.hostname.includes('twitter.com') && !urlObj.hostname.includes('x.com'))) return null
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  const firstPart = pathParts[0]
  if (!firstPart || ['i', 'intent', 'home', 'explore', 'notifications', 'messages', 'search', 'settings', 'about', 'tos', 'privacy', 'hashtag'].includes(firstPart)) {
    return null
  }
  if (firstPart.includes('.') || firstPart.includes('?')) return null
  return { url: `https://x.com/${firstPart}`, username: firstPart }
}

export function rankTwitterProfiles(results: GoogleSearchResult[], query: string): SocialSearchHit[] {
  return rankUsernameProfiles(results, query, extractTwitterProfile, [], 0.4, 0.4).slice(0, 10)
}

function rankUsernameProfiles(
  results: GoogleSearchResult[],
  query: string,
  extract: (url: string) => { url: string; username: string } | null,
  suffixes: RegExp[],
  titleWeight: number,
  usernameWeight: number,
): SocialSearchHit[] {
  const groups = new Map<string, { url: string; username: string; title: string; titleScore: number; occurrences: number; rank: number }>()

  results.forEach((result, index) => {
    const extracted = extract(result.link)
    if (!extracted) return
    const tScore = titleScore(result.title, query, suffixes)
    const existing = groups.get(extracted.url)
    if (existing) {
      existing.occurrences += 1
      if (tScore > existing.titleScore) {
        existing.title = result.title
        existing.titleScore = tScore
      }
      existing.rank = Math.min(existing.rank, index)
    } else {
      groups.set(extracted.url, {
        url: extracted.url,
        username: extracted.username,
        title: result.title,
        titleScore: tScore,
        occurrences: 1,
        rank: index,
      })
    }
  })

  return [...groups.values()]
    .map((group) => {
      const uScore = usernameScore(group.username, query)
      const occurrenceScore = Math.min(group.occurrences / 3, 1)
      const remaining = 1 - titleWeight - usernameWeight
      const score = group.titleScore * titleWeight
        + uScore * usernameWeight
        + occurrenceScore * remaining * 0.5
        + rankScore(group.rank) * remaining * 0.5
      return {
        url: group.url,
        title: group.title,
        username: group.username,
        score,
        occurrences: group.occurrences,
      }
    })
    .filter((result) => result.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export async function searchSocial(
  platform: 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'youtube' | 'x',
  query: string,
  search: (q: string) => Promise<GoogleSearchResult[]>,
): Promise<SocialSearchHit[]> {
  if (platform === 'facebook') return rankFacebookPages(await search(`${query} site:facebook.com`), query)
  if (platform === 'instagram') return rankInstagramProfiles(await search(`${query} site:instagram.com`), query)
  if (platform === 'tiktok') return rankTikTokProfiles(await search(`${query} site:tiktok.com -inurl:video`), query)
  if (platform === 'linkedin') return rankLinkedInProfiles(await search(`"${query}" site:linkedin.com`), query)
  if (platform === 'youtube') return rankYouTubeChannels(await search(`${query} site:youtube.com -inurl:watch -inurl:playlist`), query)

  const [xResults, twitterResults] = await Promise.all([
    search(`"${query}" site:x.com`),
    search(`"${query}" site:twitter.com`),
  ])
  return rankTwitterProfiles([...xResults, ...twitterResults], query)
}

export interface WebsiteSocialLinks {
  facebook?: string
  instagram?: string
  tiktok?: string
  linkedin?: string
  youtube?: string
  x?: string
}

export function socialsFromDocument(document: HtmlDocument): WebsiteSocialLinks {
  const hrefs = document.querySelectorAll('a').map((anchor) => anchor.getAttribute('href') ?? '')
  const found: WebsiteSocialLinks = {}

  for (const href of hrefs) {
    if (!found.facebook) {
      const page = extractFacebookPage(href)
      if (page) found.facebook = page.url
    }
    if (!found.instagram) {
      const profile = extractInstagramProfile(href)
      if (profile) found.instagram = profile.username
    }
    if (!found.tiktok) {
      const profile = extractTikTokProfile(href)
      if (profile) found.tiktok = profile.username
    }
    if (!found.linkedin) {
      const profile = extractLinkedInProfile(href)
      if (profile) found.linkedin = profile.url
    }
    if (!found.youtube) {
      const channel = extractYouTubeChannel(href)
      if (channel) found.youtube = channel.url
    }
    if (!found.x) {
      const profile = extractTwitterProfile(href)
      if (profile) found.x = profile.username
    }
  }

  return found
}
