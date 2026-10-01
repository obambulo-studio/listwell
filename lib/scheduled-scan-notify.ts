import { getCloudflareEnv } from "./audit-env";
import {
  ensureNotificationPrefs,
  getActiveEntitlementOwner,
  getScanEmailRecipient,
} from "./data";
import { buildScanEmail } from "./scan-email";
import type { ScanEmailBusiness, ScanEmailContent } from "./scan-email";
import { readUseSendConfig, sendUseSendEmail } from "./usesend";

export interface PendingScanEmail {
  businesses: ScanEmailBusiness[];
  listUnsubscribeUrl: string;
  siteUrl: string;
  to: string;
  unsubscribeUrl: string;
}

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
      "prepareScanEmailNotification: could not ensure notification prefs",
      error
    );
    return null;
  }
};

export const prepareScanEmailNotification = async (input: {
  businessId: string;
  businessName: string;
  finishedAt: string | null;
  previousScore: number | null;
  score: number | null;
  siteUrl: string;
}): Promise<PendingScanEmail | null> => {
  let recipient = null;
  try {
    recipient = await getScanEmailRecipient(input.businessId);
  } catch (error) {
    console.error(
      "prepareScanEmailNotification: recipient lookup failed",
      error
    );
    return null;
  }

  if (!recipient?.email || !recipient.monthlyScanEmails) {
    return null;
  }

  const unsubscribeToken = await resolveUnsubscribeToken(
    input.businessId,
    recipient.unsubscribeToken
  );
  if (!unsubscribeToken) {
    console.error(
      "prepareScanEmailNotification: missing unsubscribe token; skipping email"
    );
    return null;
  }

  const siteBase = input.siteUrl.replace(/\/$/u, "");
  const unsubscribeUrl = `${siteBase}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const listUnsubscribeUrl = `${siteBase}/api/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

  return {
    businesses: [
      {
        businessId: input.businessId,
        businessName: input.businessName,
        finishedAt: input.finishedAt,
        previousScore: input.previousScore,
        score: input.score,
      },
    ],
    listUnsubscribeUrl,
    siteUrl: siteBase,
    to: recipient.email,
    unsubscribeUrl,
  };
};

const batchKey = (pending: PendingScanEmail): string =>
  `${pending.to}\0${pending.listUnsubscribeUrl}`;

export const mergePendingScanEmails = (
  pending: readonly PendingScanEmail[]
): PendingScanEmail[] => {
  const groups = new Map<string, PendingScanEmail>();
  for (const item of pending) {
    const key = batchKey(item);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...item,
        businesses: [...item.businesses],
      });
      continue;
    }
    for (const business of item.businesses) {
      existing.businesses = existing.businesses.filter(
        (entry) => entry.businessId !== business.businessId
      );
      existing.businesses.push(business);
    }
  }

  return [...groups.values()];
};

const readUseSendConfigFromEnv = async () => {
  const workerEnv = await getCloudflareEnv();
  return (
    readUseSendConfig({
      USESEND_API_KEY:
        workerEnv?.USESEND_API_KEY ?? process.env.USESEND_API_KEY,
      USESEND_BASE_URL:
        workerEnv?.USESEND_BASE_URL ?? process.env.USESEND_BASE_URL,
      USESEND_FROM: workerEnv?.USESEND_FROM ?? process.env.USESEND_FROM,
    }) ?? null
  );
};

export const sendPendingScanEmails = async (
  pending: readonly PendingScanEmail[]
): Promise<{ sent: number; skipped: number }> => {
  if (pending.length === 0) {
    return { sent: 0, skipped: 0 };
  }

  const config = await readUseSendConfigFromEnv();
  if (!config) {
    console.error(
      "sendPendingScanEmails: UseSend is not configured on the Worker"
    );
    return { sent: 0, skipped: pending.length };
  }

  const merged = mergePendingScanEmails(pending);
  const sendOneGroup = async (group: PendingScanEmail): Promise<boolean> => {
    let email: ScanEmailContent;
    try {
      email = buildScanEmail({
        businesses: group.businesses,
        listUnsubscribeUrl: group.listUnsubscribeUrl,
        siteUrl: group.siteUrl,
        unsubscribeUrl: group.unsubscribeUrl,
      });
    } catch (error) {
      console.error("sendPendingScanEmails: could not build email", error);
      return false;
    }

    return await sendUseSendEmail(config, {
      html: email.html,
      listUnsubscribeUrl: email.listUnsubscribeUrl,
      subject: email.subject,
      text: email.text,
      to: group.to,
    });
  };
  const deliveries = await Promise.all(merged.map(sendOneGroup));
  const sent = deliveries.filter(Boolean).length;

  return { sent, skipped: merged.length - sent };
};
