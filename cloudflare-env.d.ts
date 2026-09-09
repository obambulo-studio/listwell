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

interface R2Bucket {
  get: (key: string) => Promise<R2ObjectBody | null>;
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null
  ) => Promise<R2Object | null>;
  delete: (key: string) => Promise<void>;
}

interface R2ObjectBody {
  body: ReadableStream;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

interface R2Object {
  key: string;
}

interface DurableObjectId {
  toString: () => string;
}

interface DurableObjectStub {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

interface DurableObjectNamespace {
  get: (id: DurableObjectId) => DurableObjectStub;
  idFromName: (name: string) => DurableObjectId;
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
  GOOGLE_API_KEY?: string;
  GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID?: string;
  IMAGES?: ImagesBinding;
  INTERNAL_API_SECRET?: string;
  LISTWELL_BROWSER_RENDERING_ACCOUNT_ID?: string;
  LISTWELL_BROWSER_RENDERING_API_TOKEN?: string;
  NEXT_CACHE_DO_QUEUE?: DurableObjectNamespace;
  NEXT_INC_CACHE_R2_BUCKET?: R2Bucket;
  NEXT_PUBLIC_CONVEX_SITE_URL?: string;
  NEXT_PUBLIC_CONVEX_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_PRODUCT_REPORT_MONTHLY?: string;
  POLAR_PRODUCT_REPORT_ONCE?: string;
  POLAR_SERVER?: string;
  POLAR_WEBHOOK_SECRET?: string;
  SITE_URL?: string;
  USESEND_API_KEY?: string;
  USESEND_BASE_URL?: string;
  USESEND_FROM?: string;
  WORKER_SELF_REFERENCE?: Fetcher;
}
