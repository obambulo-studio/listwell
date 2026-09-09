import { z } from "zod";

import { looksLikeThinSpa } from "./html";
import type { SerializedHttpResponse } from "./types";

export interface BrowserRenderingConfig {
  accountId?: string;
  apiToken?: string;
}

export interface FetchWebsiteOptions {
  browserRendering?: BrowserRenderingConfig;
  fetchImpl?: typeof fetch;
  preferBrowser?: boolean;
  /** Workers Browser Rendering binding (or any HTML renderer). Used after a thin-SPA fetch. */
  renderHtml?: (url: string) => Promise<string>;
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
      "user-agent": "ListwellAuditBot/1.0 (+https://listwell.au)",
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

/**
 * Prefer a plain fetch. Fall back to Browser Rendering only when the page
 * looks like a thin SPA — faster than always launching puppeteer.
 */
export const fetchWebsiteHtml = async (
  url: string,
  options: FetchWebsiteOptions = {}
): Promise<string> => {
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!options.preferBrowser) {
    try {
      const plain = await fetchPlain(url, fetchImpl);
      if (plain.ok && !looksLikeThinSpa(plain.body)) {
        return plain.body;
      }
    } catch {
      // Fall through to Browser Rendering.
    }
  }

  if (options.renderHtml) {
    try {
      return await options.renderHtml(url);
    } catch {
      // Fall through to REST Browser Rendering or the last plain fetch.
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
      headers: { "user-agent": "ListwellAuditBot/1.0 (+https://listwell.au)" },
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
