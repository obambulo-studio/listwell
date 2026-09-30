import type { CheckContext } from "../context";
import { compareProfileAvatars } from "../lookups/social-images";
import {
  daysSince,
  FRESHNESS_PASS_SCORE,
  freshnessAgeLabel,
  freshnessScore,
} from "../lookups/social-profiles";
import type { SocialProfileEvidence } from "../lookups/social-profiles";
import { checkResult } from "../schemas";
import type { CheckResult } from "../types";

const readableProfiles = (
  profiles: SocialProfileEvidence[]
): SocialProfileEvidence[] => profiles.filter((profile) => profile.readable);

const unreadReason = (profiles: SocialProfileEvidence[]): string => {
  const reason = profiles.find((profile) => profile.reason)?.reason;
  if (reason) {
    return `${reason}. We do not invent missing profile facts.`;
  }
  return "Social profile pages could not be read. We do not invent missing profile facts.";
};

const requireReadable = async (
  ctx: CheckContext
): Promise<
  | { kind: "profiles"; profiles: SocialProfileEvidence[] }
  | { kind: "result"; result: CheckResult }
> => {
  const profiles = await ctx.getSocialProfileEvidence();
  if (profiles.length === 0) {
    return {
      kind: "result",
      result: checkResult(null, "No social profiles linked to this audit"),
    };
  }
  const readable = readableProfiles(profiles);
  if (readable.length === 0) {
    return {
      kind: "result",
      result: checkResult(null, unreadReason(profiles)),
    };
  }
  return { kind: "profiles", profiles: readable };
};

const joinLabels = (profiles: SocialProfileEvidence[]): string =>
  profiles.map((profile) => profile.label).join(", ");

export const checkSocialProfileBanner = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  const resolved = await requireReadable(ctx);
  if (resolved.kind === "result") {
    return resolved.result;
  }
  const missing = resolved.profiles.filter((profile) => !profile.bannerUrl);
  if (missing.length > 0) {
    return checkResult(false, `No banner on ${joinLabels(missing)}.`);
  }
  return checkResult(true, `Banner found on ${joinLabels(resolved.profiles)}.`);
};

export const checkSocialProfileImageMatch = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  const profiles = await ctx.getSocialProfileEvidence();
  if (profiles.length === 0) {
    return checkResult(null, "No social profiles linked to this audit");
  }
  const compared = await compareProfileAvatars(ctx, profiles);
  if (compared === "too-few") {
    return checkResult(
      null,
      "Need at least two readable profile images to compare. We do not invent a match."
    );
  }
  if (compared === "unknown") {
    return checkResult(
      null,
      "Profile images could not be compared. We do not invent a match."
    );
  }
  if (compared === "different") {
    return checkResult(false, "Profile images do not match.");
  }
  return checkResult(true, "Profile images match.");
};

export const checkSocialProfileFreshness = async (
  ctx: CheckContext
): Promise<CheckResult> => {
  const resolved = await requireReadable(ctx);
  if (resolved.kind === "result") {
    return resolved.result;
  }
  const now = Date.now();
  const parts: string[] = [];
  let passes = true;
  for (const profile of resolved.profiles) {
    if (!profile.latestPostAt) {
      parts.push(`${profile.label} no public post (0)`);
      passes = false;
      continue;
    }
    const days = daysSince(profile.latestPostAt, now);
    if (days === null) {
      parts.push(`${profile.label} no public post (0)`);
      passes = false;
      continue;
    }
    const score = freshnessScore(days);
    parts.push(`${profile.label} ${freshnessAgeLabel(days)} (${score})`);
    if (score < FRESHNESS_PASS_SCORE) {
      passes = false;
    }
  }
  return checkResult(passes, parts.join(" · "));
};
