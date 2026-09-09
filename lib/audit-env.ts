import {
  businessSnapshotSchema,
  LCP_PROBE_SCRIPT,
  parseSyntheticTiming,
  performanceFromTiming,
} from "@listwell/audit-engine";
import type {
  AuditEngineEnv,
  BusinessSnapshot,
  FetchWebsiteOptions,
  PerformanceData,
} from "@listwell/audit-engine";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";

import type { Business } from "./schema";

const optionalString = z.string().min(1).optional();

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalString.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** Browser Rendering REST creds. Use LISTWELL_* in .env.local so Wrangler/OpenNext remote dev does not treat a Browser Rendering-only token as the Workers CLI token. */
const browserRenderingAccountId = (
  workerEnv: CloudflareEnv | null
): string | undefined =>
  readSecret(process.env.LISTWELL_BROWSER_RENDERING_ACCOUNT_ID) ??
  readSecret(workerEnv?.CLOUDFLARE_ACCOUNT_ID) ??
  readSecret(process.env.CLOUDFLARE_ACCOUNT_ID);

const browserRenderingApiToken = (
  workerEnv: CloudflareEnv | null
): string | undefined =>
  readSecret(process.env.LISTWELL_BROWSER_RENDERING_API_TOKEN) ??
  readSecret(workerEnv?.CLOUDFLARE_API_TOKEN) ??
  readSecret(process.env.CLOUDFLARE_API_TOKEN);

export const toBusinessSnapshot = (business: Business): BusinessSnapshot =>
  businessSnapshotSchema.parse({
    category: business.category,
    deliverooUrl: business.deliverooUrl,
    doorDashUrl: business.doorDashUrl,
    facebookUsername: business.facebookUsername,
    id: business.id,
    instagramUsername: business.instagramUsername,
    linkedinUrl: business.linkedinUrl,
    locations: business.locations.map((location) => ({
      address: location.address,
      appleMapsId: location.appleMapsId,
      googlePlaceId: location.googlePlaceId,
      name: location.name,
    })),
    menulogUrl: business.menulogUrl,
    name: business.name,
    tiktokUsername: business.tiktokUsername,
    uberEatsUrl: business.uberEatsUrl,
    websiteUrl: business.websiteUrl,
    xUsername: business.xUsername,
    youtubeUrl: business.youtubeUrl,
  });

export const getCloudflareEnv = async (): Promise<CloudflareEnv | null> => {
  if (process.env.SKIP_OPENNEXT_DEV === "1") {
    return null;
  }
  try {
    const context = await getCloudflareContext({ async: true });
    return context.env;
  } catch {
    return null;
  }
};

export const getExecutionContext =
  async (): Promise<ExecutionContext | null> => {
    try {
      const context = await getCloudflareContext({ async: true });
      return context.ctx;
    } catch {
      return null;
    }
  };

export interface LookupProviders {
  google: boolean;
  apple: boolean;
  osm: true;
}

export const lookupProvidersFromEnv = (
  engineEnv: AuditEngineEnv
): LookupProviders => ({
  apple: Boolean(
    engineEnv.appleMapkitTeamId &&
    engineEnv.appleMapkitKeyId &&
    engineEnv.appleMapkitPrivateKey
  ),
  google: Boolean(engineEnv.googleApiKey),
  osm: true,
});

export const getAuditEngineEnv = async (): Promise<AuditEngineEnv> => {
  const env = await getCloudflareEnv();
  return {
    appleMapkitKeyId:
      readSecret(env?.APPLE_MAPKIT_KEY_ID) ??
      readSecret(process.env.APPLE_MAPKIT_KEY_ID),
    appleMapkitPrivateKey:
      readSecret(env?.APPLE_MAPKIT_PRIVATE_KEY) ??
      readSecret(process.env.APPLE_MAPKIT_PRIVATE_KEY),
    appleMapkitTeamId:
      readSecret(env?.APPLE_MAPKIT_TEAM_ID) ??
      readSecret(process.env.APPLE_MAPKIT_TEAM_ID),
    cloudflareAccountId: browserRenderingAccountId(env),
    cloudflareApiToken: browserRenderingApiToken(env),
    googleApiKey:
      readSecret(env?.GOOGLE_API_KEY) ?? readSecret(process.env.GOOGLE_API_KEY),
    googleProgrammableSearchEngineId:
      readSecret(env?.GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID) ??
      readSecret(process.env.GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID),
  };
};

const renderWithBrowserBinding = async (
  browser: Fetcher,
  url: string
): Promise<string> => {
  const puppeteer = await import("@cloudflare/puppeteer");
  const instance = await puppeteer.launch(browser);
  try {
    const page = await instance.newPage();
    await page.goto(url, { timeout: 30_000, waitUntil: "networkidle0" });
    return await page.content();
  } finally {
    await instance.close();
  }
};

const ignoreTimingProbeMiss = (): void => {
  // LCP probe timing is optional; page content still parses without it.
};

const measureWithBrowserBinding = async (
  browser: Fetcher,
  url: string
): Promise<PerformanceData> => {
  const puppeteer = await import("@cloudflare/puppeteer");
  const instance = await puppeteer.launch(browser);
  try {
    const page = await instance.newPage();
    await page.evaluateOnNewDocument(LCP_PROBE_SCRIPT);
    await page.goto(url, { timeout: 30_000, waitUntil: "networkidle0" });
    await page
      .waitForFunction(
        () =>
          Boolean(
            document.documentElement.dataset.listwellLcp ||
            document.documentElement.dataset.listwellTiming
          ),
        { timeout: 5000 }
      )
      .catch(ignoreTimingProbeMiss);
    const html = await page.content();
    const timing = parseSyntheticTiming(html);
    if (timing.value !== undefined) {
      return performanceFromTiming(timing.value, timing.kind);
    }

    const evaluatedSchema = z.object({
      kind: z.enum(["lcp", "load", "none"]),
      value: z.number().optional(),
    });
    const evaluated = evaluatedSchema.parse(
      await page.evaluate(() => {
        const entries = performance.getEntriesByType(
          "largest-contentful-paint"
        );
        const [lastEntry] = entries.slice(-1);
        if (lastEntry && typeof lastEntry.startTime === "number") {
          return { kind: "lcp", value: Math.round(lastEntry.startTime) };
        }
        const [navigation] = performance.getEntriesByType("navigation");
        if (
          navigation &&
          "loadEventEnd" in navigation &&
          typeof navigation.loadEventEnd === "number" &&
          navigation.loadEventEnd > 0
        ) {
          return { kind: "load", value: Math.round(navigation.loadEventEnd) };
        }
        return { kind: "none" };
      })
    );
    return performanceFromTiming(evaluated.value, evaluated.kind);
  } finally {
    await instance.close();
  }
};

export const getFetchWebsiteOptions =
  async (): Promise<FetchWebsiteOptions> => {
    const [env, engineEnv] = await Promise.all([
      getCloudflareEnv(),
      getAuditEngineEnv(),
    ]);
    // OpenNext dev exposes a BROWSER binding that launches @cloudflare/puppeteer locally
    // and downloads Chromium (often hangs at "Downloading browser... 100%"). In dev, use
    // the Browser Rendering REST API from CLOUDFLARE_* env vars instead.
    const browser =
      process.env.NODE_ENV === "development" ? undefined : env?.BROWSER;
    return {
      browserRendering: {
        accountId: engineEnv.cloudflareAccountId,
        apiToken: engineEnv.cloudflareApiToken,
      },
      measurePerformance: browser
        ? (url: string) => measureWithBrowserBinding(browser, url)
        : undefined,
      renderHtml: browser
        ? (url: string) => renderWithBrowserBinding(browser, url)
        : undefined,
    };
  };
