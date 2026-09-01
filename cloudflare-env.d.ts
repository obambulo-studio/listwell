interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<T>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Queue<T = unknown> {
  send(message: T): Promise<void>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

interface CloudflareEnv {
  DB: D1Database;
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
}
