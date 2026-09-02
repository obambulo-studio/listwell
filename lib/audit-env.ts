import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  businessSnapshotSchema,
  LCP_PROBE_SCRIPT,
  parseSyntheticTiming,
  performanceFromTiming,
  type AuditEngineEnv,
  type BusinessSnapshot,
  type FetchWebsiteOptions,
  type PerformanceData,
} from "@listwell/audit-engine";
import { z } from "zod";
import type { Business } from "./schema";

const optionalString = z.string().min(1).optional();

function readSecret(value: unknown): string | undefined {
  const parsed = optionalString.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function toBusinessSnapshot(business: Business): BusinessSnapshot {
  return businessSnapshotSchema.parse({
    id: business.id,
    name: business.name,
    category: business.category,
    websiteUrl: business.websiteUrl,
    facebookUsername: business.facebookUsername,
    instagramUsername: business.instagramUsername,
    tiktokUsername: business.tiktokUsername,
    xUsername: business.xUsername,
    linkedinUrl: business.linkedinUrl,
    youtubeUrl: business.youtubeUrl,
    uberEatsUrl: business.uberEatsUrl,
    doorDashUrl: business.doorDashUrl,
    deliverooUrl: business.deliverooUrl,
    menulogUrl: business.menulogUrl,
    locations: business.locations.map((location) => ({
      googlePlaceId: location.googlePlaceId,
      appleMapsId: location.appleMapsId,
      name: location.name,
      address: location.address,
    })),
  });
}

export async function getCloudflareEnv(): Promise<CloudflareEnv | null> {
  if (process.env.SKIP_OPENNEXT_DEV === "1") {
    return null;
  }
  try {
    const context = await getCloudflareContext({ async: true });
    return context.env;
  } catch {
    return null;
  }
}

export async function getExecutionContext(): Promise<ExecutionContext | null> {
  try {
    const context = await getCloudflareContext({ async: true });
    return context.ctx;
  } catch {
    return null;
  }
}

export async function getAuditEngineEnv(): Promise<AuditEngineEnv> {
  const env = await getCloudflareEnv();
  return {
    cloudflareAccountId: readSecret(env?.CLOUDFLARE_ACCOUNT_ID) ?? readSecret(process.env.CLOUDFLARE_ACCOUNT_ID),
    cloudflareApiToken: readSecret(env?.CLOUDFLARE_API_TOKEN) ?? readSecret(process.env.CLOUDFLARE_API_TOKEN),
  };
}

export async function getFetchWebsiteOptions(): Promise<FetchWebsiteOptions> {
  const env = await getCloudflareEnv();
  const engineEnv = await getAuditEngineEnv();
  const browser = env?.BROWSER;
  return {
    browserRendering: {
      accountId: engineEnv.cloudflareAccountId,
      apiToken: engineEnv.cloudflareApiToken,
    },
    renderHtml: browser ? async (url: string) => renderWithBrowserBinding(browser, url) : undefined,
    measurePerformance: browser
      ? async (url: string) => measureWithBrowserBinding(browser, url)
      : undefined,
  };
}

async function renderWithBrowserBinding(browser: Fetcher, url: string): Promise<string> {
  const puppeteer = await import("@cloudflare/puppeteer");
  const instance = await puppeteer.launch(browser);
  try {
    const page = await instance.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    return await page.content();
  } finally {
    await instance.close();
  }
}

async function measureWithBrowserBinding(browser: Fetcher, url: string): Promise<PerformanceData> {
  const puppeteer = await import("@cloudflare/puppeteer");
  const instance = await puppeteer.launch(browser);
  try {
    const page = await instance.newPage();
    await page.evaluateOnNewDocument(LCP_PROBE_SCRIPT);
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction(
      () => Boolean(document.documentElement.getAttribute("data-listwell-lcp") || document.documentElement.getAttribute("data-listwell-timing")),
      { timeout: 5000 },
    ).catch(() => undefined);
    const html = await page.content();
    const timing = parseSyntheticTiming(html);
    if (timing.value !== undefined) {
      return performanceFromTiming(timing.value, timing.kind);
    }

    const evaluatedSchema = z.object({
      value: z.number().optional(),
      kind: z.enum(["lcp", "load", "none"]),
    });
    const evaluated = evaluatedSchema.parse(
      await page.evaluate(() => {
        const entries = performance.getEntriesByType("largest-contentful-paint");
        const last = entries[entries.length - 1];
        if (last && typeof last.startTime === "number") {
          return { value: Math.round(last.startTime), kind: "lcp" };
        }
        const navigation = performance.getEntriesByType("navigation")[0];
        if (
          navigation
          && "loadEventEnd" in navigation
          && typeof navigation.loadEventEnd === "number"
          && navigation.loadEventEnd > 0
        ) {
          return { value: Math.round(navigation.loadEventEnd), kind: "load" };
        }
        return { kind: "none" };
      }),
    );
    return performanceFromTiming(evaluated.value, evaluated.kind);
  } finally {
    await instance.close();
  }
}
