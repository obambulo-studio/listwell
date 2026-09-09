import type { HtmlDocument } from "../html";
import type { GoogleSearchResult, SocialSearchHit } from "../types";

const containsToken = (haystack: string, needle: string): boolean =>
  needle.length > 0 && haystack.split(needle).length > 1;

const titleScore = (
  title: string,
  searchQuery: string,
  suffixes: RegExp[]
): number => {
  const normalizedQuery = searchQuery.toLowerCase().trim();
  let cleanTitle = title.toLowerCase().trim();
  for (const suffix of suffixes) {
    cleanTitle = cleanTitle.replace(suffix, "");
  }
  cleanTitle = cleanTitle.trim();

  if (cleanTitle === normalizedQuery) {
    return 1;
  }
  if (cleanTitle.includes(normalizedQuery)) {
    return cleanTitle.startsWith(normalizedQuery) ||
      cleanTitle.endsWith(normalizedQuery)
      ? 0.9
      : 0.8;
  }

  const queryWords = normalizedQuery
    .split(/\s+/u)
    .filter((word) => word.length > 2);
  const titleWordSet = new Set(cleanTitle.split(/\s+/u));
  if (queryWords.length === 0) {
    return 0;
  }

  let exactWordMatches = 0;
  let partialWordMatches = 0;
  for (const queryWord of queryWords) {
    if (titleWordSet.has(queryWord)) {
      exactWordMatches += 1;
      continue;
    }
    let hasPartial = false;
    for (const word of titleWordSet) {
      if (containsToken(word, queryWord) || containsToken(queryWord, word)) {
        hasPartial = true;
        break;
      }
    }
    if (hasPartial) {
      partialWordMatches += 1;
    }
  }

  return (
    (exactWordMatches / queryWords.length) * 0.7 +
    (partialWordMatches / queryWords.length) * 0.3
  );
};

const usernameScore = (username: string, searchQuery: string): number => {
  const normalizedUsername = username.toLowerCase();
  const normalizedQuery = searchQuery.toLowerCase().replaceAll(/\s+/gu, "");
  if (normalizedUsername === normalizedQuery) {
    return 1;
  }
  if (normalizedUsername.includes(normalizedQuery)) {
    return 0.9;
  }

  const queryWords = searchQuery
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word.length > 2);
  if (queryWords.length === 0) {
    return 0;
  }
  const matchingWords = queryWords.filter((word) =>
    normalizedUsername.includes(word)
  ).length;
  return (matchingWords / queryWords.length) * 0.8;
};

const rankScore = (index: number): number => Math.max(0, 1 - index * 0.1);

const rankUsernameProfiles = (
  results: GoogleSearchResult[],
  query: string,
  extract: (url: string) => { url: string; username: string } | null,
  suffixes: RegExp[],
  titleWeight: number,
  usernameWeight: number
): SocialSearchHit[] => {
  const groups = new Map<
    string,
    {
      url: string;
      username: string;
      title: string;
      titleScore: number;
      occurrences: number;
      rank: number;
    }
  >();

  for (const [index, result] of results.entries()) {
    const extracted = extract(result.link);
    if (!extracted) {
      continue;
    }
    const tScore = titleScore(result.title, query, suffixes);
    const existing = groups.get(extracted.url);
    if (existing) {
      existing.occurrences += 1;
      if (tScore > existing.titleScore) {
        existing.title = result.title;
        existing.titleScore = tScore;
      }
      existing.rank = Math.min(existing.rank, index);
    } else {
      groups.set(extracted.url, {
        occurrences: 1,
        rank: index,
        title: result.title,
        titleScore: tScore,
        url: extracted.url,
        username: extracted.username,
      });
    }
  }

  return [...groups.values()]
    .flatMap((group) => {
      const uScore = usernameScore(group.username, query);
      const occurrenceScore = Math.min(group.occurrences / 3, 1);
      const remaining = 1 - titleWeight - usernameWeight;
      const score =
        group.titleScore * titleWeight +
        uScore * usernameWeight +
        occurrenceScore * remaining * 0.5 +
        rankScore(group.rank) * remaining * 0.5;
      if (score <= 0.2) {
        return [];
      }
      return [
        {
          occurrences: group.occurrences,
          score,
          title: group.title,
          url: group.url,
          username: group.username,
        },
      ];
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5);
};

const safeUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const firstPathSegment = (pathname: string): string | undefined =>
  pathname.split("/").find((segment) => segment.length > 0);

const FACEBOOK_BLOCKED_SEGMENTS = new Set([
  "groups",
  "events",
  "marketplace",
  "watch",
  "gaming",
]);

const extractFacebookProfileId = (
  urlObj: URL
): { url: string; pageId: string | null; urlType: string } | null => {
  const idParam = urlObj.searchParams.get("id");
  if (idParam && /^\d+$/u.test(idParam)) {
    return {
      pageId: idParam,
      url: `https://www.facebook.com/profile.php?id=${idParam}`,
      urlType: "profile",
    };
  }
  return null;
};

const extractFacebookPPage = (
  pathParts: string[]
): { url: string; pageId: string | null; urlType: string } | null => {
  const [, slug] = pathParts;
  if (!slug) {
    return null;
  }
  const pageIdMatch = slug.match(/-(?<pageId>\d+)$/u);
  return {
    pageId: pageIdMatch?.groups?.pageId ?? null,
    url: `https://www.facebook.com/p/${slug}/`,
    urlType: "p-format",
  };
};

const extractFacebookPagesRoute = (
  pathParts: string[]
): { url: string; pageId: string | null; urlType: string } | null => {
  const pageId = pathParts.at(-1);
  if (!pageId || !/^\d+$/u.test(pageId)) {
    return null;
  }
  return {
    pageId,
    url: `https://www.facebook.com/pages/${pathParts.slice(1).join("/")}/`,
    urlType: "pages",
  };
};

const extractFacebookNumericOrVanity = (
  firstPart: string
): { url: string; pageId: string | null; urlType: string } | null => {
  if (/^\d+$/u.test(firstPart)) {
    return {
      pageId: firstPart,
      url: `https://www.facebook.com/${firstPart}/`,
      urlType: "numeric",
    };
  }
  if (
    !firstPart.includes(".php") &&
    !firstPart.includes("?") &&
    !firstPart.includes("=")
  ) {
    return {
      pageId: null,
      url: `https://www.facebook.com/${firstPart}/`,
      urlType: "vanity",
    };
  }
  return null;
};

export const extractFacebookPage = (
  url: string
): { url: string; pageId: string | null; urlType: string } | null => {
  const urlObj = safeUrl(url);
  if (!urlObj || !urlObj.hostname.includes("facebook.com")) {
    return null;
  }

  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const firstPart = firstPathSegment(urlObj.pathname);
  if (!firstPart) {
    return null;
  }
  if (firstPart.includes("story.php") || firstPart.includes("photo.php")) {
    return null;
  }
  if (firstPart.includes("profile.php")) {
    return extractFacebookProfileId(urlObj);
  }
  if (FACEBOOK_BLOCKED_SEGMENTS.has(firstPart)) {
    return null;
  }
  if (firstPart === "p") {
    return extractFacebookPPage(pathParts);
  }
  if (firstPart === "pages" && pathParts.length >= 3) {
    return extractFacebookPagesRoute(pathParts);
  }
  return extractFacebookNumericOrVanity(firstPart);
};

export const rankFacebookPages = (
  results: GoogleSearchResult[],
  query: string
): SocialSearchHit[] => {
  const groups = new Map<
    string,
    {
      url: string;
      title: string;
      titleScore: number;
      urlScore: number;
      occurrences: number;
      rank: number;
    }
  >();

  for (const [index, result] of results.entries()) {
    const page = extractFacebookPage(result.link);
    if (!page) {
      continue;
    }
    const tScore = titleScore(result.title, query, []);
    const pathName = firstPathSegment(new URL(page.url).pathname) ?? "";
    const uScore =
      usernameScore(pathName.replaceAll("-", ""), query) *
      (page.urlType === "vanity" ? 1.2 : 1);
    const key = page.pageId ?? page.url;
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences += 1;
      if (tScore > existing.titleScore) {
        existing.title = result.title;
        existing.titleScore = tScore;
      }
      if (uScore > existing.urlScore) {
        existing.url = page.url;
        existing.urlScore = uScore;
      }
      existing.rank = Math.min(existing.rank, index);
    } else {
      groups.set(key, {
        occurrences: 1,
        rank: index,
        title: result.title,
        titleScore: tScore,
        url: page.url,
        urlScore: uScore,
      });
    }
  }

  return [...groups.values()]
    .flatMap((group) => {
      const occurrenceScore = Math.min(group.occurrences / 5, 1);
      const googleWeight = group.titleScore >= 0.9 ? 0.45 : 0.25;
      const score =
        group.titleScore * (group.titleScore >= 0.9 ? 0.3 : 0.35) +
        group.urlScore * (group.titleScore >= 0.9 ? 0.15 : 0.25) +
        occurrenceScore * (group.titleScore >= 0.9 ? 0.1 : 0.15) +
        rankScore(group.rank) * googleWeight;
      if (score <= 0.3) {
        return [];
      }
      return [
        {
          occurrences: group.occurrences,
          score,
          title: group.title,
          url: group.url,
        },
      ];
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5);
};

export const extractInstagramProfile = (
  url: string
): { url: string; username: string } | null => {
  const urlObj = safeUrl(url);
  if (!urlObj || !urlObj.hostname.includes("instagram.com")) {
    return null;
  }
  const firstPart = firstPathSegment(urlObj.pathname);
  if (!firstPart) {
    return null;
  }
  if (
    ["p", "reel", "stories", "tv", "explore", "accounts"].includes(firstPart)
  ) {
    return null;
  }
  if (
    firstPart.includes(".") ||
    firstPart.includes("?") ||
    firstPart.includes("=") ||
    /^\d+$/u.test(firstPart)
  ) {
    return null;
  }
  return {
    url: `https://www.instagram.com/${firstPart}/`,
    username: firstPart,
  };
};

export const rankInstagramProfiles = (
  results: GoogleSearchResult[],
  query: string
): SocialSearchHit[] =>
  rankUsernameProfiles(
    results,
    query,
    extractInstagramProfile,
    [/\s*\(\s*@[^)]+\)\s*$/u, /\s*•\s*instagram.*$/u, /\s*-\s*instagram.*$/u],
    0.25,
    0.4
  );

export const extractTikTokProfile = (
  url: string
): { url: string; username: string } | null => {
  const urlObj = safeUrl(url);
  if (!urlObj || !urlObj.hostname.includes("tiktok.com")) {
    return null;
  }
  const firstPart = firstPathSegment(urlObj.pathname);
  if (
    !firstPart ||
    [
      "discover",
      "tag",
      "video",
      "t",
      "legal",
      "about",
      "music",
      "effect",
    ].includes(firstPart)
  ) {
    return null;
  }
  if (!firstPart.startsWith("@")) {
    return null;
  }
  const username = firstPart.slice(1);
  return { url: `https://www.tiktok.com/@${username}`, username };
};

export const rankTikTokProfiles = (
  results: GoogleSearchResult[],
  query: string
): SocialSearchHit[] =>
  rankUsernameProfiles(
    results,
    query,
    extractTikTokProfile,
    [
      /\s*\|\s*tiktok.*$/u,
      /\s*-\s*tiktok.*$/u,
      /\s*\(\s*@[^)]+\)\s*.*$/u,
      /\s*on\s+tiktok.*$/u,
    ],
    0.25,
    0.45
  );

export const extractYouTubeChannel = (
  url: string
): { url: string; handle?: string; channelId?: string } | null => {
  const urlObj = safeUrl(url);
  if (
    !urlObj ||
    (!urlObj.hostname.includes("youtube.com") &&
      !urlObj.hostname.includes("youtu.be"))
  ) {
    return null;
  }
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const firstPart = firstPathSegment(urlObj.pathname);
  if (
    !firstPart ||
    ["watch", "playlist", "shorts", "live", "feed", "results"].includes(
      firstPart
    )
  ) {
    return null;
  }
  if (firstPart === "channel" && pathParts[1]) {
    return {
      channelId: pathParts[1],
      url: `https://www.youtube.com/channel/${pathParts[1]}`,
    };
  }
  if ((firstPart === "c" || firstPart === "user") && pathParts[1]) {
    return {
      handle: pathParts[1],
      url: `https://www.youtube.com/${firstPart}/${pathParts[1]}`,
    };
  }
  if (firstPart.startsWith("@")) {
    const handle = firstPart.slice(1);
    return { handle, url: `https://www.youtube.com/@${handle}` };
  }
  if (!firstPart.includes(".") && !firstPart.includes("?")) {
    return { handle: firstPart, url: `https://www.youtube.com/${firstPart}` };
  }
  return null;
};

export const rankYouTubeChannels = (
  results: GoogleSearchResult[],
  query: string
): SocialSearchHit[] =>
  rankUsernameProfiles(
    results,
    query,
    (url) => {
      const extracted = extractYouTubeChannel(url);
      if (!extracted) {
        return null;
      }
      return {
        url: extracted.url,
        username: extracted.handle ?? extracted.channelId ?? extracted.url,
      };
    },
    [/\s*-\s*youtube.*$/iu, /\s*\|\s*youtube.*$/iu, /\s*on\s+youtube.*$/iu],
    0.3,
    0.35
  );

export const extractLinkedInProfile = (
  url: string
): {
  url: string;
  identifier: string;
  profileType: "company" | "personal";
} | null => {
  const urlObj = safeUrl(url);
  if (!urlObj || !urlObj.hostname.includes("linkedin.com")) {
    return null;
  }
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const firstPart = firstPathSegment(urlObj.pathname);
  if (
    !firstPart ||
    [
      "learning",
      "jobs",
      "feed",
      "groups",
      "events",
      "messaging",
      "search",
      "help",
      "legal",
      "about",
      "business",
    ].includes(firstPart)
  ) {
    return null;
  }
  if (firstPart === "company" && pathParts[1]) {
    return {
      identifier: pathParts[1],
      profileType: "company",
      url: `https://www.linkedin.com/company/${pathParts[1]}`,
    };
  }
  if (firstPart === "in" && pathParts[1]) {
    return {
      identifier: pathParts[1],
      profileType: "personal",
      url: `https://www.linkedin.com/in/${pathParts[1]}`,
    };
  }
  if (firstPart === "pub" && pathParts.length >= 2) {
    const identifier = pathParts.slice(1).join("/");
    return {
      identifier,
      profileType: "personal",
      url: `https://www.linkedin.com/pub/${identifier}`,
    };
  }
  return null;
};

export const rankLinkedInProfiles = (
  results: GoogleSearchResult[],
  query: string
): SocialSearchHit[] => {
  const hits: SocialSearchHit[] = [];
  for (const result of results) {
    const profile = extractLinkedInProfile(result.link);
    if (!profile) {
      continue;
    }
    const tScore = titleScore(result.title, query, []);
    const typeBonus = profile.profileType === "company" ? 0.2 : 0.1;
    const score = Math.min(tScore + typeBonus, 1);
    if (score >= 0.3) {
      hits.push({
        score,
        title: result.title,
        url: profile.url,
        username: profile.identifier,
      });
    }
  }
  const unique = new Map<string, SocialSearchHit>();
  for (const hit of hits) {
    const existing = unique.get(hit.url);
    if (!existing || hit.score > existing.score) {
      unique.set(hit.url, hit);
    }
  }
  return [...unique.values()].toSorted((a, b) => b.score - a.score);
};

export const extractTwitterProfile = (
  url: string
): { url: string; username: string } | null => {
  const urlObj = safeUrl(url);
  if (
    !urlObj ||
    (!urlObj.hostname.includes("twitter.com") &&
      !urlObj.hostname.includes("x.com"))
  ) {
    return null;
  }
  const firstPart = firstPathSegment(urlObj.pathname);
  if (
    !firstPart ||
    [
      "i",
      "intent",
      "home",
      "explore",
      "notifications",
      "messages",
      "search",
      "settings",
      "about",
      "tos",
      "privacy",
      "hashtag",
    ].includes(firstPart)
  ) {
    return null;
  }
  if (firstPart.includes(".") || firstPart.includes("?")) {
    return null;
  }
  return { url: `https://x.com/${firstPart}`, username: firstPart };
};

export const rankTwitterProfiles = (
  results: GoogleSearchResult[],
  query: string
): SocialSearchHit[] =>
  rankUsernameProfiles(
    results,
    query,
    extractTwitterProfile,
    [],
    0.4,
    0.4
  ).slice(0, 10);

export const searchSocial = async (
  platform: "facebook" | "instagram" | "tiktok" | "linkedin" | "youtube" | "x",
  query: string,
  search: (q: string) => Promise<GoogleSearchResult[]>
): Promise<SocialSearchHit[]> => {
  if (platform === "facebook") {
    return rankFacebookPages(await search(`${query} site:facebook.com`), query);
  }
  if (platform === "instagram") {
    return rankInstagramProfiles(
      await search(`${query} site:instagram.com`),
      query
    );
  }
  if (platform === "tiktok") {
    return rankTikTokProfiles(
      await search(`${query} site:tiktok.com -inurl:video`),
      query
    );
  }
  if (platform === "linkedin") {
    return rankLinkedInProfiles(
      await search(`"${query}" site:linkedin.com`),
      query
    );
  }
  if (platform === "youtube") {
    return rankYouTubeChannels(
      await search(`${query} site:youtube.com -inurl:watch -inurl:playlist`),
      query
    );
  }

  const [xResults, twitterResults] = await Promise.all([
    search(`"${query}" site:x.com`),
    search(`"${query}" site:twitter.com`),
  ]);
  return rankTwitterProfiles([...xResults, ...twitterResults], query);
};

export interface WebsiteSocialLinks {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  linkedin?: string;
  youtube?: string;
  x?: string;
}

export const socialsFromDocument = (
  document: HtmlDocument
): WebsiteSocialLinks => {
  const hrefs = document
    .querySelectorAll("a")
    .map((anchor) => anchor.getAttribute("href") ?? "");
  const found: WebsiteSocialLinks = {};

  for (const href of hrefs) {
    if (!found.facebook) {
      const page = extractFacebookPage(href);
      if (page) {
        found.facebook = page.url;
      }
    }
    if (!found.instagram) {
      const profile = extractInstagramProfile(href);
      if (profile) {
        found.instagram = profile.username;
      }
    }
    if (!found.tiktok) {
      const profile = extractTikTokProfile(href);
      if (profile) {
        found.tiktok = profile.username;
      }
    }
    if (!found.linkedin) {
      const profile = extractLinkedInProfile(href);
      if (profile) {
        found.linkedin = profile.url;
      }
    }
    if (!found.youtube) {
      const channel = extractYouTubeChannel(href);
      if (channel) {
        found.youtube = channel.url;
      }
    }
    if (!found.x) {
      const profile = extractTwitterProfile(href);
      if (profile) {
        found.x = profile.username;
      }
    }
  }

  return found;
};
