import { customerIpAddress } from "./polar-server";

const WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 30;

export const consumeRateLimit = async (input: {
  bucket: string;
  env: CloudflareEnv | null;
  maxRequests?: number;
  request: Request;
  /** Fail closed when KV is unavailable (default: fail open for dev). */
  failClosed?: boolean;
}): Promise<boolean> => {
  const kv = input.env?.AUDIT_KV;
  if (!kv) {
    return !(input.failClosed ?? false);
  }

  const ip = customerIpAddress(input.request) ?? "unknown";
  const key = `ratelimit:${input.bucket}:${ip}`;
  const maxRequests = input.maxRequests ?? DEFAULT_MAX_REQUESTS;

  try {
    // Fixed-window counter: store count + window start together so the
    // TTL is not extended on every request (sliding-window drift).
    const stored = await kv.get(key, "text");
    const raw = typeof stored === "string" ? stored : null;
    const nowSec = Math.floor(Date.now() / 1000);
    let count = 0;
    let windowStart = nowSec;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          count?: unknown;
          windowStart?: unknown;
        };
        if (
          typeof parsed.count === "number" &&
          Number.isFinite(parsed.count) &&
          typeof parsed.windowStart === "number" &&
          Number.isFinite(parsed.windowStart)
        ) {
          // Expired window -> reset.
          if (nowSec - parsed.windowStart < WINDOW_SECONDS) {
            count = Math.max(0, Math.floor(parsed.count));
            windowStart = Math.floor(parsed.windowStart);
          }
        } else {
          // Legacy plain-number value: treat as current-window count.
          const legacy = Number(raw);
          if (Number.isFinite(legacy)) {
            count = Math.max(0, Math.floor(legacy));
          }
        }
      } catch {
        count = 0;
        windowStart = nowSec;
      }
    }
    if (count >= maxRequests) {
      return false;
    }
    const ttl = Math.max(1, WINDOW_SECONDS - (nowSec - windowStart));
    await kv.put(key, JSON.stringify({ count: count + 1, windowStart }), {
      expirationTtl: ttl,
    });
    return true;
  } catch {
    return !(input.failClosed ?? false);
  }
};
