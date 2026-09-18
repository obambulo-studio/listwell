import type { CloudflareEnv } from "../cloudflare-env";
import { customerIpAddress } from "./polar-server";

const WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 30;

export const consumeRateLimit = async (input: {
  bucket: string;
  env: CloudflareEnv | null;
  maxRequests?: number;
  request: Request;
}): Promise<boolean> => {
  const kv = input.env?.AUDIT_KV;
  if (!kv) {
    return true;
  }

  const ip = customerIpAddress(input.request) ?? "unknown";
  const key = `ratelimit:${input.bucket}:${ip}`;
  const maxRequests = input.maxRequests ?? DEFAULT_MAX_REQUESTS;

  const raw = await kv.get(key);
  const count = raw ? Number(raw) : 0;
  if (!Number.isFinite(count) || count >= maxRequests) {
    return false;
  }

  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
};
