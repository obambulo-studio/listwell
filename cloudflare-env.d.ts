interface KVNamespace {
  get: (
    key: string,
    type?: "text" | "json"
  ) => Promise<string | null | unknown>;
  list: (options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }) => Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  put: (
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ) => Promise<void>;
  delete: (key: string) => Promise<void>;
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

interface ImagesBinding {
  input: (
    stream: ReadableStream,
    options: Record<string, unknown>
  ) => Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: CloudflareEnv;
  export const waitUntil: (promise: Promise<unknown>) => void;
}

interface CloudflareEnv {
  ASSETS?: Fetcher;
  AUDIT_KV?: KVNamespace;
  AUDIT_QUEUE?: Queue;
  AI?: AiBinding;
  APPLE_MAPKIT_KEY_ID?: string;
  APPLE_MAPKIT_PRIVATE_KEY?: string;
  APPLE_MAPKIT_TEAM_ID?: string;
  BROWSER?: Fetcher;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  DATAFORSEO_API_KEY?: string;
  DATAFORSEO_MONTHLY_CEILING_USD?: string;
  DATAFORSEO_SANDBOX?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID?: string;
  IMAGES?: ImagesBinding;
  INTERNAL_API_SECRET?: string;
  LISTWELL_BROWSER_RENDERING_ACCOUNT_ID?: string;
  LISTWELL_BROWSER_RENDERING_API_TOKEN?: string;
  LISTWELL_PAYMENTS_DISABLED?: string;
  NEXT_PUBLIC_CONVEX_SITE_URL?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_PRODUCT_ANALYTICS_10K?: string;
  POLAR_PRODUCT_ANALYTICS_100K?: string;
  POLAR_PRODUCT_ANALYTICS_1M?: string;
  POLAR_PRODUCT_REPORT_MONTHLY?: string;
  POLAR_PRODUCT_REPORT_ONCE?: string;
  POLAR_PRODUCT_REPORT_YEARLY?: string;
  POLAR_SERVER?: string;
  POLAR_WEBHOOK_SECRET?: string;
  SITE_PASSWORD?: string;
  SITE_URL?: string;
  TINYFISH_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
  TYPESAFE_MODEL?: string;
  USESEND_API_KEY?: string;
  USESEND_BASE_URL?: string;
  USESEND_FROM?: string;
  WORKER_SELF_REFERENCE?: Fetcher;
}
