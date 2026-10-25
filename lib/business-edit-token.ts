import { getCloudflareEnv } from "./cloudflare-env";

export const BUSINESS_EDIT_TOKEN_HEADER = "x-listwell-edit-token";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/u;
const memoryTokens = new Map<string, string>();

const editTokenKey = (businessId: string): string =>
  `business-edit-token:${businessId}`;

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return toHex(new Uint8Array(digest));
};

const timingSafeEqualHex = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const maxLength = Math.max(leftBytes.length, rightBytes.length);
  // eslint-disable-next-line no-bitwise
  let diff = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < maxLength; index += 1) {
    // eslint-disable-next-line no-bitwise
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
};

const readStoredHash = async (businessId: string): Promise<string | null> => {
  const env = await getCloudflareEnv();
  if (env?.AUDIT_KV) {
    const stored: unknown = await env.AUDIT_KV.get(editTokenKey(businessId));
    return typeof stored === "string" ? stored : null;
  }
  return memoryTokens.get(businessId) ?? null;
};

/** Returns the raw token once. Callers store it in the browser that created the audit. */
export const issueBusinessEditToken = async (
  businessId: string
): Promise<string> => {
  const token = toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const [hash, env] = await Promise.all([sha256Hex(token), getCloudflareEnv()]);
  if (env?.AUDIT_KV) {
    await env.AUDIT_KV.put(editTokenKey(businessId), hash);
  } else {
    memoryTokens.set(businessId, hash);
  }
  return token;
};

export type BusinessEditAccess = "match" | "legacy" | "denied";

/**
 * Unclaimed audits created before edit tokens existed have no stored hash.
 * Those stay editable. A stored hash requires the matching token.
 */
export const businessEditAccess = async (
  businessId: string,
  token: string | null
): Promise<BusinessEditAccess> => {
  const stored = await readStoredHash(businessId);
  if (!stored) {
    return "legacy";
  }
  if (!token || !TOKEN_PATTERN.test(token)) {
    return "denied";
  }
  const presented = await sha256Hex(token);
  return timingSafeEqualHex(presented, stored) ? "match" : "denied";
};
