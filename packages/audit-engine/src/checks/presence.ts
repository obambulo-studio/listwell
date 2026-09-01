import { checkResult } from '../schemas'
import type { CheckContext } from '../context'
import type { CheckResult } from '../types'

export async function checkFacebookPage(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.facebookUsername))
}

export async function checkInstagramProfile(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.instagramUsername))
}

export async function checkTikTokProfile(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.tiktokUsername))
}

export async function checkLinkedInProfile(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.linkedinUrl))
}

export async function checkYouTubeProfile(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.youtubeUrl))
}

export async function checkUberEatsListing(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.uberEatsUrl))
}

export async function checkDoorDashListing(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.doorDashUrl))
}

export async function checkDeliverooListing(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.deliverooUrl))
}

export async function checkMenulogListing(ctx: CheckContext): Promise<CheckResult> {
  return checkResult(Boolean(ctx.business.menulogUrl))
}
