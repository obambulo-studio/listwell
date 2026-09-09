import { noWebsiteResult } from "../context";
import type { CheckContext } from "../context";
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

export const checkTikTokProfile = (ctx: CheckContext): Promise<CheckResult> =>
  Promise.resolve(
    presenceResult(ctx.business.tiktokUsername, "TikTok profile")
  );

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
