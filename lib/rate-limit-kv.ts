import { z } from "zod";

import { customerIpAddress } from "./polar-server";

const WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 30;

const storedCounterSchema = z.object({
  count: z.number().finite(),
  windowStart: z.number().finite(),
});

const allowedDecision = { allowed: true } as const;

const limitedDecision = { allowed: false, reason: "limited" } as const;

const unavailableDecision = {
  allowed: false,
  reason: "unavailable",
} as const;

export type RateLimitDecision =
  | typeof allowedDecision
  | typeof limitedDecision
  | typeof unavailableDecision;

export interface RateLimitInput {
  bucket: string;
  env: CloudflareEnv | null;
  maxRequests?: number;
  request: Request;
  /** Fail closed when KV is unavailable (default: fail open for dev). */
  failClosed?: boolean;
}

const closedOrAllowed = (failClosed: boolean | undefined): RateLimitDecision =>
  failClosed ? unavailableDecision : allowedDecision;

/** Fixed-window counter. Checkout and discover pass `failClosed: true`. */
export const evaluateRateLimit = async (
  input: RateLimitInput
): Promise<RateLimitDecision> => {
  const kv = input.env?.AUDIT_KV;
  if (!kv) {
    return closedOrAllowed(input.failClosed);
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
        const storedJson: unknown = JSON.parse(raw);
        const parsed = storedCounterSchema.safeParse(storedJson);
        if (parsed.success) {
          // Expired window -> reset.
          if (nowSec - parsed.data.windowStart < WINDOW_SECONDS) {
            count = Math.max(0, Math.floor(parsed.data.count));
            windowStart = Math.floor(parsed.data.windowStart);
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
      return limitedDecision;
    }
    const ttl = Math.max(1, WINDOW_SECONDS - (nowSec - windowStart));
    await kv.put(key, JSON.stringify({ count: count + 1, windowStart }), {
      expirationTtl: ttl,
    });
    return allowedDecision;
  } catch {
    return closedOrAllowed(input.failClosed);
  }
};

export const consumeRateLimit = async (
  input: RateLimitInput
): Promise<boolean> => {
  const decision = await evaluateRateLimit(input);
  return decision.allowed;
};

export const TOO_MANY_REQUESTS_ERROR = "Too many requests. Try again soon.";

/** HTTP body for a denied decision. Null when the request may proceed. */
export const rateLimitHttpError = (
  decision: RateLimitDecision,
  unavailableError: string
): { error: string; status: 429 | 503 } | null => {
  if (decision.allowed) {
    return null;
  }
  if (decision.reason === "unavailable") {
    return { error: unavailableError, status: 503 };
  }
  return { error: TOO_MANY_REQUESTS_ERROR, status: 429 };
};
