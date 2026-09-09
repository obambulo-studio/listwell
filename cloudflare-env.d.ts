interface KVNamespace {
  get: (
    key: string,
    type?: "text" | "json"
  ) => Promise<string | null | unknown>;
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ) => Promise<void>;
}

interface Queue<T = unknown> {
  send: (message: T) => Promise<void>;
}

interface Fetcher {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

interface ExportedHandler<E = unknown> {
  fetch?: (
    request: Request,
    env: E,
    ctx: ExecutionContext
  ) => Response | Promise<Response>;
  scheduled?: (
    event: ScheduledEvent,
    env: E,
    ctx: ExecutionContext
  ) => void | Promise<void>;
}

interface AiBinding {
  run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
}

interface CloudflareEnv {
  AUDIT_KV?: KVNamespace;
  AUDIT_QUEUE?: Queue;
  BROWSER?: Fetcher;
  AI?: AiBinding;
  GOOGLE_API_KEY?: string;
  GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID?: string;
  APPLE_MAPKIT_TEAM_ID?: string;
  APPLE_MAPKIT_KEY_ID?: string;
  APPLE_MAPKIT_PRIVATE_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_PRODUCT_REPORT_ONCE?: string;
  POLAR_PRODUCT_REPORT_MONTHLY?: string;
  POLAR_SERVER?: string;
  INTERNAL_API_SECRET?: string;
  USESEND_API_KEY?: string;
  USESEND_FROM?: string;
  USESEND_BASE_URL?: string;
}
