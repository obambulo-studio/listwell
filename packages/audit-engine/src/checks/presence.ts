import { noWebsiteResult } from "../context";
import type { CheckContext } from "../context";
import { searchSocial } from "../lookups/social";
import { checkResult } from "../schemas";
import type { CheckResult } from "../types";

const presenceResult = (
  value: string | null | undefined,
  label: string
): CheckResult => {
  if (!value) {
    return checkResult(null, `No ${label} linked to this audit`);
  }
  return checkResult(true);
};

export const checkWebsite = (ctx: CheckContext): Promise<CheckResult> => {
  if (!ctx.business.websiteUrl) {
    return Promise.resolve(noWebsiteResult());
  }
  return Promise.resolve(checkResult(true));
};

export const checkFacebookPage = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(
    presenceResult(ctx.business.facebookUsername, "Facebook page")
  );

export const checkInstagramProfile = (
  ctx: CheckContext
): Promise<CheckResult> =>
  Promise.resolve(
    presenceResult(ctx.business.instagramUsername, "Instagram profile")
  );

const TIKTOK_MATCH_SCORE = 0.7;

export const checkTikTokProfile = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  if (ctx.business.tiktokUsername) {
    return checkResult(true);
  }
  const canSearch = Boolean(
    ctx.env.googleApiKey && ctx.env.googleProgrammableSearchEngineId
  );
  if (!canSearch) {
    return checkResult(null, "No TikTok profile linked to this audit");
  }
  try {
    const hits = await searchSocial("tiktok", ctx.business.name, (query) =>
      ctx.googleSearch(query)
    );
    const [hit] = hits;
    if (!hit || hit.score < TIKTOK_MATCH_SCORE) {
      return checkResult(false, "No TikTok profile found in search");
    }
    return checkResult(true, hit.url);
  } catch (error) {
    return checkResult(
      null,
      error instanceof Error ? error.message : "TikTok search failed"
    );
  }
};

export const checkLinkedInProfile = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(presenceResult(ctx.business.linkedinUrl, "LinkedIn profile"));

export const checkYouTubeProfile = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(presenceResult(ctx.business.youtubeUrl, "YouTube channel"));

export const checkUberEatsListing = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(
    presenceResult(ctx.business.uberEatsUrl, "Uber Eats listing")
  );

export const checkDoorDashListing = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(presenceResult(ctx.business.doorDashUrl, "DoorDash listing"));

export const checkDeliverooListing = (
  ctx: CheckContext
): Promise<CheckResult> =>
  Promise.resolve(
    presenceResult(ctx.business.deliverooUrl, "Deliveroo listing")
  );

export const checkMenulogListing = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(presenceResult(ctx.business.menulogUrl, "Menulog listing"));
