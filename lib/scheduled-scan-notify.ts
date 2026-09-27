import { getCloudflareEnv } from "./audit-env";
import type { CategoryId } from "./category";
import {
  ensureNotificationPrefs,
  getActiveEntitlementOwner,
  getScanEmailRecipient,
} from "./data";
import { buildScanEmail } from "./scan-email";
import type { ScanSnapshot } from "./scan-email";
import type { ScanRow } from "./schema";
import { readUseSendConfig, sendUseSendEmail } from "./usesend";

const toSnapshot = (scan: {
  results: ScanRow["results"];
  score: number | null;
}): ScanSnapshot => ({
  results: scan.results,
  score: scan.score,
});

const resolveUnsubscribeToken = async (
  businessId: string,
  existing: string | null | undefined
): Promise<string | null> => {
  if (existing) {
    return existing;
  }
  const owner = await getActiveEntitlementOwner(businessId);
  if (!owner.backendAvailable || !owner.ownerUserId) {
    return null;
  }
  try {
    return await ensureNotificationPrefs(owner.ownerUserId);
  } catch (error) {
    console.error(
      "notifyScheduledScanComplete: could not ensure notification prefs",
      error
    );
    return null;
  }
};

export const notifyScheduledScanComplete = async (input: {
  businessCategory: CategoryId;
  businessId: string;
  businessName: string;
  previousComplete: Pick<ScanRow, "results" | "score"> | null;
  scan: ScanRow;
  siteUrl: string;
}): Promise<{ sent: boolean; skipped: boolean }> => {
  if (input.scan.status !== "complete") {
    return { sent: false, skipped: true };
  }

  let recipient = null;
  try {
    recipient = await getScanEmailRecipient(input.businessId);
  } catch (error) {
    console.error(
      "notifyScheduledScanComplete: recipient lookup failed",
      error
    );
    return { sent: false, skipped: true };
  }

  if (!recipient?.email || !recipient.monthlyScanEmails) {
    return { sent: false, skipped: true };
  }

  const unsubscribeToken = await resolveUnsubscribeToken(
    input.businessId,
    recipient.unsubscribeToken
  );

  const workerEnv = await getCloudflareEnv();
  const config =
    readUseSendConfig({
      USESEND_API_KEY:
        workerEnv?.USESEND_API_KEY ?? process.env.USESEND_API_KEY,
      USESEND_BASE_URL:
        workerEnv?.USESEND_BASE_URL ?? process.env.USESEND_BASE_URL,
      USESEND_FROM: workerEnv?.USESEND_FROM ?? process.env.USESEND_FROM,
    }) ?? null;

  if (!config) {
    console.error(
      "notifyScheduledScanComplete: UseSend is not configured on the Worker"
    );
    return { sent: false, skipped: true };
  }

  const siteBase = input.siteUrl.replace(/\/$/u, "");
  const reportUrl = `${siteBase}/${input.businessId}`;
  if (!unsubscribeToken) {
    console.error(
      "notifyScheduledScanComplete: missing unsubscribe token; skipping email"
    );
    return { sent: false, skipped: true };
  }

  const unsubscribeUrl = `${siteBase}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  let email;
  try {
    email = buildScanEmail({
      businessCategory: input.businessCategory,
      businessName: input.businessName,
      current: toSnapshot(input.scan),
      previous: input.previousComplete
        ? toSnapshot(input.previousComplete)
        : null,
      reportUrl,
      unsubscribeUrl,
    });
  } catch (error) {
    console.error("notifyScheduledScanComplete: could not build email", error);
    return { sent: false, skipped: true };
  }

  const sent = await sendUseSendEmail(config, {
    html: email.html,
    listUnsubscribeUrl: email.listUnsubscribeUrl,
    subject: email.subject,
    text: email.text,
    to: recipient.email,
  });
  return { sent, skipped: false };
};
