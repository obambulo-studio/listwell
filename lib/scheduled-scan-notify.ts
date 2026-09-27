import { getCloudflareEnv } from "./audit-env";
import {
  ensureNotificationPrefs,
  getActiveEntitlementOwner,
  getScanEmailRecipient,
} from "./data";
import type { ScanRow } from "./schema";
import { buildScanEmail, type ScanSnapshot } from "./scan-email";
import { readUseSendConfig, sendUseSendEmail } from "./usesend";

const toSnapshot = (scan: {
  results: ScanRow["results"];
  score: number | null;
}): ScanSnapshot => ({
  results: scan.results,
  score: scan.score,
});

export const notifyScheduledScanComplete = async (input: {
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
    console.error("notifyScheduledScanComplete: recipient lookup failed", error);
    return { sent: false, skipped: true };
  }

  if (!recipient?.email || !recipient.monthlyScanEmails) {
    return { sent: false, skipped: true };
  }

  let { unsubscribeToken } = recipient;
  if (!unsubscribeToken) {
    const owner = await getActiveEntitlementOwner(input.businessId);
    if (owner.backendAvailable && owner.ownerUserId) {
      try {
        unsubscribeToken = await ensureNotificationPrefs(owner.ownerUserId);
      } catch (error) {
        console.error(
          "notifyScheduledScanComplete: could not ensure notification prefs",
          error
        );
      }
    }
  }

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
  const unsubscribeUrl = unsubscribeToken
    ? `${siteBase}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
    : undefined;
  const email = buildScanEmail({
    businessName: input.businessName,
    current: toSnapshot(input.scan),
    previous: input.previousComplete
      ? toSnapshot(input.previousComplete)
      : null,
    reportUrl,
    unsubscribeUrl,
  });

  const sent = await sendUseSendEmail(config, {
    html: email.html,
    subject: email.subject,
    text: email.text,
    to: recipient.email,
  });
  return { sent, skipped: false };
};
