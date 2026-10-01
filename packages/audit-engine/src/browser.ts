import { z } from "zod";

import { looksLikeThinSpa } from "./html";
import type { SerializedHttpResponse } from "./types";

export interface BrowserRenderingConfig {
  accountId?: string;
  apiToken?: string;
}

/** Distinct TinyFish Fetch pages per audit: home, contact, and menu. */
export const TINYFISH_RENDER_URL_CAP = 3;

const TINYFISH_FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai";

/**
 * Free TinyFish Fetch budget shared by one audit.
 * Agent and search endpoints are not on this object.
 */
export interface TinyFishFetchBudget {
  apiKey: string;
  rendered: Map<string, Promise<string>>;
}

export const createTinyFishFetchBudget = (
  apiKey: string
): TinyFishFetchBudget => ({
  apiKey,
  rendered: new Map(),
});

export interface FetchWebsiteOptions {
  browserRendering?: BrowserRenderingConfig;
  fetchImpl?: typeof fetch;
  preferBrowser?: boolean;
  /** Workers Browser Rendering binding (or any HTML renderer). Used after a thin-SPA fetch. */
  renderHtml?: (url: string) => Promise<string>;
  /**
   * Free rendered HTML for thin pages. When set, extra pages past the cap stay on the plain fetch.
   * Browser Rendering still measures LCP separately.
   */
  tinyFish?: TinyFishFetchBudget;
  /** Optional synthetic LCP / load timing from the Browser Rendering session. */
  measurePerformance?: (url: string) => Promise<{
    lcp?: number;
    passes?: boolean;
    kind?: "lcp" | "load" | "none";
    message: string;
  }>;
}

const browserContentSchema = z.object({
  errors: z.array(z.object({ message: z.string().optional() })).optional(),
  result: z.string().optional(),
  success: z.boolean(),
});

export const fetchPlain = async (
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<SerializedHttpResponse> => {
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "ListwellAuditBot/1.0 (+https://listwell.dev)",
    },
    redirect: "follow",
  });

  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }

  const isRedirect = response.status >= 300 && response.status < 400;
  const body = isRedirect ? "" : await response.text();

  return {
    body,
    headers,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
  };
};

/**
 * Cloudflare Browser Rendering REST `/content` — faster than a full puppeteer
 * session when we only need rendered HTML.
 */
export const fetchBrowserRenderingHtml = async (
  url: string,
  config: BrowserRenderingConfig,
  fetchImpl: typeof fetch = fetch,
  extras: { injectScript?: string } = {}
): Promise<string> => {
  if (!config.accountId || !config.apiToken) {
    throw new Error("Cloudflare Browser Rendering is not configured");
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/content`;
  const payload: Record<string, unknown> = {
    gotoOptions: { timeout: 30_000, waitUntil: "networkidle0" },
    url,
  };
  if (extras.injectScript) {
    payload.addScriptTag = [{ content: extras.injectScript }];
  }

  const response = await fetchImpl(endpoint, {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const json: unknown = await response.json();
  const parsed = browserContentSchema.parse(json);
  if (!parsed.success || typeof parsed.result !== "string") {
    const message =
      parsed.errors?.[0]?.message ??
      `Browser Rendering failed (${response.status})`;
    throw new Error(message);
  }

  return parsed.result;
};

const tinyFishFetchResponseSchema = z.object({
  errors: z
    .array(
      z.object({
        error: z.string().optional(),
        url: z.string().optional(),
      })
    )
    .optional(),
  results: z
    .array(
      z.object({
        text: z.string().nullable().optional(),
      })
    )
    .optional(),
});

/**
 * Render one known URL. Fetch is free. Do not call TinyFish Agent or Exa here:
 * those are priced per step and do not fit the monthly report.
 */
export const fetchTinyFishHtml = async (
  url: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> => {
  const response = await fetchImpl(TINYFISH_FETCH_ENDPOINT, {
    body: JSON.stringify({
      format: "html",
      purpose: "Read a small-business page for a local SEO checklist",
      urls: [url],
    }),
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    method: "POST",
    signal: AbortSignal.timeout(45_000),
  });

  const json: unknown = await response.json();
  const parsed = tinyFishFetchResponseSchema.parse(json);
  const text = parsed.results?.[0]?.text?.trim() ?? "";
  if (!response.ok || !text.includes("<")) {
    const reason =
      parsed.errors?.[0]?.error ?? `TinyFish Fetch failed (${response.status})`;
    throw new Error(reason);
  }
  return text;
};

type TinyFishRead =
  | { html: string; kind: "html" }
  | { kind: "capped" }
  | { kind: "failed" }
  | { kind: "unused" };

const readTinyFishHtml = async (
  url: string,
  budget: TinyFishFetchBudget | undefined,
  fetchImpl: typeof fetch
): Promise<TinyFishRead> => {
  if (!budget) {
    return { kind: "unused" };
  }

  const cached = budget.rendered.get(url);
  if (cached) {
    try {
      return { html: await cached, kind: "html" };
    } catch {
      return { kind: "failed" };
    }
  }

  if (budget.rendered.size >= TINYFISH_RENDER_URL_CAP) {
    return { kind: "capped" };
  }

  const pending = fetchTinyFishHtml(url, budget.apiKey, fetchImpl);
  budget.rendered.set(url, pending);
  try {
    return { html: await pending, kind: "html" };
  } catch {
    budget.rendered.delete(url);
    return { kind: "failed" };
  }
};

const readBrowserHtml = async (
  url: string,
  options: FetchWebsiteOptions,
  fetchImpl: typeof fetch
): Promise<string | undefined> => {
  if (options.renderHtml) {
    try {
      return await options.renderHtml(url);
    } catch {
      // Fall through to REST Browser Rendering.
    }
  }

  if (
    options.browserRendering?.accountId &&
    options.browserRendering.apiToken
  ) {
    return await fetchBrowserRenderingHtml(
      url,
      options.browserRendering,
      fetchImpl
    );
  }

  return undefined;
};

/**
 * Prefer a plain fetch. Thin pages use TinyFish Fetch, up to three distinct URLs.
 * Browser Rendering stays the LCP path, and the HTML fallback when TinyFish is unset or fails.
 */
export const fetchWebsiteHtml = async (
  url: string,
  options: FetchWebsiteOptions = {}
): Promise<string> => {
  const fetchImpl = options.fetchImpl ?? fetch;
  let plainBody: string | undefined;
  let plainOk = false;

  if (!options.preferBrowser) {
    try {
      const plain = await fetchPlain(url, fetchImpl);
      plainBody = plain.body;
      plainOk = plain.ok;
      if (plain.ok && !looksLikeThinSpa(plain.body)) {
        return plain.body;
      }
    } catch {
      // Fall through to a rendered fetch.
    }
  }

  const rendered = await readTinyFishHtml(url, options.tinyFish, fetchImpl);
  if (rendered.kind === "html") {
    return rendered.html;
  }

  if (rendered.kind !== "capped") {
    const browserHtml = await readBrowserHtml(url, options, fetchImpl);
    if (browserHtml !== undefined) {
      return browserHtml;
    }
  }

  if (plainOk && plainBody !== undefined) {
    return plainBody;
  }

  const fallback = await fetchPlain(url, fetchImpl);
  if (!fallback.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${fallback.status} ${fallback.statusText}`
    );
  }
  return fallback.body;
};

export const fetchWebsiteResponse = (
  url: string,
  options: FetchWebsiteOptions = {}
): Promise<SerializedHttpResponse> =>
  fetchPlain(url, options.fetchImpl ?? fetch);

export const fetchText = async (
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number; body: string }> => {
  try {
    const response = await fetchImpl(url, {
      headers: { "user-agent": "ListwellAuditBot/1.0 (+https://listwell.dev)" },
    });
    return {
      body: await response.text(),
      ok: response.ok,
      status: response.status,
    };
  } catch {
    return { body: "", ok: false, status: 0 };
  }
};
