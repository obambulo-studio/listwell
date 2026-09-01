import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  businessSnapshotSchema,
  type AuditEngineEnv,
  type BusinessSnapshot,
  type FetchWebsiteOptions,
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
    googleApiKey: readSecret(env?.GOOGLE_API_KEY) ?? readSecret(process.env.GOOGLE_API_KEY),
    googleProgrammableSearchEngineId:
      readSecret(env?.GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID) ??
      readSecret(process.env.GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID),
    appleMapkitTeamId: readSecret(env?.APPLE_MAPKIT_TEAM_ID) ?? readSecret(process.env.APPLE_MAPKIT_TEAM_ID),
    appleMapkitKeyId: readSecret(env?.APPLE_MAPKIT_KEY_ID) ?? readSecret(process.env.APPLE_MAPKIT_KEY_ID),
    appleMapkitPrivateKey:
      readSecret(env?.APPLE_MAPKIT_PRIVATE_KEY) ?? readSecret(process.env.APPLE_MAPKIT_PRIVATE_KEY),
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
