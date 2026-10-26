export const AUDIT_FETCH_MAX_BYTES = 5 * 1024 * 1024;
export const AUDIT_FETCH_MAX_REDIRECTS = 5;
export const AUDIT_FETCH_TIMEOUT_MS = 20_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class UnsafeAuditUrlError extends Error {
  constructor(message = "URL is not a public http(s) address") {
    super(message);
    this.name = "UnsafeAuditUrlError";
  }
}

export interface PublicFetchOptions {
  headers?: HeadersInit;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
}

export interface PublicFetchResult {
  response: Response;
  url: string;
}

const IPV4_HOST_PATTERN =
  /^(?<first>\d{1,3})\.(?<second>\d{1,3})\.(?<third>\d{1,3})\.(?<fourth>\d{1,3})$/u;
const INTEGER_HOST_PATTERN = /^\d+$/u;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/iu;

const normalizeHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/\.$/u, "");

const bareSiteHost = (hostname: string): string =>
  normalizeHostname(hostname).replace(/^www\./u, "");

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  if (
    normalized.length === 0 ||
    normalized === "localhost" ||
    normalized === "localhost.localdomain"
  ) {
    return true;
  }
  return (
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
};

const parseIpv4 = (
  hostname: string
): readonly [number, number, number, number] | null => {
  const match = IPV4_HOST_PATTERN.exec(hostname);
  if (!match) {
    return null;
  }
  const octets = [
    match.groups?.first,
    match.groups?.second,
    match.groups?.third,
    match.groups?.fourth,
  ].map(Number);
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  const [first, second, third, fourth] = octets;
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    return null;
  }
  return [first, second, third, fourth];
};

const parseIntegerIpv4 = (
  hostname: string
): readonly [number, number, number, number] | null => {
  if (!INTEGER_HOST_PATTERN.test(hostname)) {
    return null;
  }
  const value = Number(hostname);
  const maxIpv4 = 4_294_967_295;
  if (!Number.isSafeInteger(value) || value < 0 || value > maxIpv4) {
    return null;
  }
  return [
    Math.floor(value / 16_777_216) % 256,
    Math.floor(value / 65_536) % 256,
    Math.floor(value / 256) % 256,
    value % 256,
  ];
};

const inRange = (value: number, min: number, max: number): boolean =>
  value >= min && value <= max;

const isRfc1918 = (first: number, second: number): boolean => {
  if (first === 10) {
    return true;
  }
  if (first === 172 && inRange(second, 16, 31)) {
    return true;
  }
  return first === 192 && second === 168;
};

const isSharedOrLinkLocal = (first: number, second: number): boolean => {
  if (first === 100 && inRange(second, 64, 127)) {
    return true;
  }
  return first === 169 && second === 254;
};

const isDocumentationNet = (
  first: number,
  second: number,
  third: number
): boolean => {
  if (first === 192 && second === 0 && (third === 0 || third === 2)) {
    return true;
  }
  if (first === 198 && (second === 18 || second === 19)) {
    return true;
  }
  if (first === 198 && second === 51 && third === 100) {
    return true;
  }
  return first === 203 && second === 0 && third === 113;
};

const isPublicIpv4 = (
  octets: readonly [number, number, number, number]
): boolean => {
  const [first, second, third] = octets;
  if (first === 0 || first === 127 || first >= 224) {
    return false;
  }
  if (isRfc1918(first, second) || isSharedOrLinkLocal(first, second)) {
    return false;
  }
  return !isDocumentationNet(first, second, third);
};

const parseIpv6Groups = (value: string): number[] | null => {
  if (value.length === 0) {
    return [];
  }
  const groups: number[] = [];
  for (const group of value.split(":")) {
    if (!IPV6_GROUP_PATTERN.test(group)) {
      return null;
    }
    groups.push(Number.parseInt(group, 16));
  }
  return groups;
};

const expandIpv6 = (hostname: string): number[] | null => {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (!bare.includes(":")) {
    return null;
  }
  const pieces = bare.split("::");
  if (pieces.length > 2) {
    return null;
  }
  const left = parseIpv6Groups(pieces[0] ?? "");
  if (!left) {
    return null;
  }
  if (pieces.length === 1) {
    return left.length === 8 ? left : null;
  }
  const right = parseIpv6Groups(pieces[1] ?? "");
  if (!right) {
    return null;
  }
  const missing = 8 - left.length - right.length;
  if (missing < 0) {
    return null;
  }
  const groups: number[] = [];
  for (const group of left) {
    groups.push(group);
  }
  for (let index = 0; index < missing; index += 1) {
    groups.push(0);
  }
  for (const group of right) {
    groups.push(group);
  }
  return groups.length === 8 ? groups : null;
};

const ipv4FromGroups = (
  high: number,
  low: number
): readonly [number, number, number, number] => [
  Math.floor(high / 256) % 256,
  high % 256,
  Math.floor(low / 256) % 256,
  low % 256,
];

const isUnspecifiedOrLoopback = (groups: readonly number[]): boolean => {
  const last = groups.at(-1);
  const headIsZero = groups.slice(0, 7).every((group) => group === 0);
  return headIsZero && (last === 0 || last === 1);
};

const isUniqueLocalOrLinkLocal = (first: number): boolean =>
  (first >= 0xfc_00 && first <= 0xfd_ff) ||
  (first >= 0xfe_80 && first <= 0xfe_ff) ||
  first >= 0xff_00;

type Ipv6Groups = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const asIpv6Groups = (groups: readonly number[]): Ipv6Groups | null => {
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = groups;
  if (
    groups.length !== 8 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined ||
    seventh === undefined ||
    eighth === undefined
  ) {
    return null;
  }
  return [first, second, third, fourth, fifth, sixth, seventh, eighth];
};

const isZeroPrefix = (groups: readonly number[], length: number): boolean =>
  groups.slice(0, length).every((group) => group === 0);

const isIpv4Mapped = (groups: Ipv6Groups): boolean =>
  isZeroPrefix(groups, 5) && groups[5] === 0xff_ff;

const isNat64 = (groups: Ipv6Groups): boolean =>
  groups[0] === 0x64 &&
  groups[1] === 0xff_9b &&
  isZeroPrefix(groups.slice(2), 4);

const isIpv4Compatible = (groups: Ipv6Groups): boolean =>
  isZeroPrefix(groups, 6);

const embeddedIpv4IsPublic = (groups: readonly number[]): boolean | null => {
  const parsed = asIpv6Groups(groups);
  if (!parsed) {
    return null;
  }
  if (isIpv4Mapped(parsed) || isNat64(parsed) || isIpv4Compatible(parsed)) {
    return isPublicIpv4(ipv4FromGroups(parsed[6], parsed[7]));
  }
  if (parsed[0] === 0x20_02) {
    return isPublicIpv4(ipv4FromGroups(parsed[1], parsed[2]));
  }
  return null;
};

const isPublicIpv6 = (hostname: string): boolean => {
  const groups = expandIpv6(hostname);
  if (!groups) {
    return false;
  }
  const [first] = groups;
  if (first === undefined) {
    return false;
  }
  if (isUnspecifiedOrLoopback(groups) || isUniqueLocalOrLinkLocal(first)) {
    return false;
  }
  if (first === 0x20_01 && groups[1] === 0x0d_b8) {
    return false;
  }
  const embedded = embeddedIpv4IsPublic(groups);
  if (embedded !== null) {
    return embedded;
  }
  return true;
};

const hostnameIsPublic = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);
  if (isBlockedHostname(normalized)) {
    return false;
  }
  if (normalized.startsWith("[")) {
    return isPublicIpv6(normalized);
  }
  const ipv4 = parseIpv4(normalized) ?? parseIntegerIpv4(normalized);
  if (ipv4) {
    return isPublicIpv4(ipv4);
  }
  if (normalized.includes(":")) {
    return isPublicIpv6(normalized);
  }
  return true;
};

/** Public http(s) only. Rejects loopback, private, link-local, and metadata targets. */
export const assertPublicHttpUrl = (input: string): URL => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeAuditUrlError();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeAuditUrlError();
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new UnsafeAuditUrlError();
  }
  if (!hostnameIsPublic(url.hostname)) {
    throw new UnsafeAuditUrlError();
  }
  return url;
};

/** Sitemap URLs must stay on the audited host, or its www / apex form. */
export const isPinnedSitemapUrl = (
  sitemapUrl: string,
  websiteUrl: string
): boolean => {
  let sitemap: URL;
  let website: URL;
  try {
    sitemap = assertPublicHttpUrl(sitemapUrl);
    website = assertPublicHttpUrl(websiteUrl);
  } catch {
    return false;
  }
  return bareSiteHost(sitemap.hostname) === bareSiteHost(website.hostname);
};

const readLimitedBody = async (
  response: Response,
  maxBytes: number
): Promise<Uint8Array> => {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body?.cancel();
      throw new UnsafeAuditUrlError("Response exceeded the size cap");
    }
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Chunks arrive in order. The next read has to wait for the previous one.
  /* eslint-disable no-await-in-loop */
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeAuditUrlError("Response exceeded the size cap");
    }
    chunks.push(value);
  }
  /* eslint-enable no-await-in-loop */
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const responseWithBody = (response: Response, body: Uint8Array): Response => {
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  const bytes = new ArrayBuffer(body.byteLength);
  new Uint8Array(bytes).set(body);
  return new Response(bytes, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

/**
 * Fetches a public http(s) URL. Each redirect hop is checked again.
 * The body and the wait are capped.
 */
export const fetchPublic = async (
  input: string,
  options: PublicFetchOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<PublicFetchResult> => {
  const maxBytes = options.maxBytes ?? AUDIT_FETCH_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? AUDIT_FETCH_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? AUDIT_FETCH_TIMEOUT_MS;
  let current = assertPublicHttpUrl(input).href;

  // Each hop depends on the previous Location header.
  /* eslint-disable no-await-in-loop */
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetchImpl(current, {
      headers: options.headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      const body = await readLimitedBody(response, maxBytes);
      return { response: responseWithBody(response, body), url: current };
    }
    const redirectBody = response.body;
    if (hop === maxRedirects) {
      await redirectBody?.cancel();
      throw new UnsafeAuditUrlError("Too many redirects");
    }
    const location = response.headers.get("location");
    if (!location) {
      await redirectBody?.cancel();
      throw new UnsafeAuditUrlError("Redirect is missing a location");
    }
    await redirectBody?.cancel();
    current = assertPublicHttpUrl(new URL(location, current).href).href;
  }
  /* eslint-enable no-await-in-loop */

  throw new UnsafeAuditUrlError("Too many redirects");
};
