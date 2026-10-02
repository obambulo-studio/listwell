import { z } from "zod";

import { renderPurchaseReceiptEmail } from "../emails/purchase-ready";
import type { PurchaseReceiptKind } from "../emails/purchase-ready";
import { getCloudflareEnv, getExecutionContext } from "./audit-env";
import { runBusinessCheckBatch } from "./audit-jobs";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "./chat-onboarding";
import { checksForCategory } from "./checks/registry";
import { pointsFor } from "./checks/types";
import type { CheckDefinition } from "./checks/types";
import { claimPurchaseEmail, getBusiness, releasePurchaseEmail } from "./data";
import { planNextActions } from "./fix-plan";
import { buildReportPdf, reportPdfFilename } from "./report-pdf";
import { reportPdfPayload } from "./report-pdf-payload";
import { checkResultSchema, entitlementKindSchema } from "./schema";
import type { Business, CheckResult, EntitlementKind } from "./schema";
import { listwellSiteUrl } from "./site-metadata";
import { buildFallbackSummary, completedCheckSchema } from "./summaries";
import { bytesToBase64, readUseSendConfig, sendUseSendEmail } from "./usesend";
import type { UseSendAttachment, UseSendConfig } from "./usesend";

const emailSchema = z.string().email();

const receiptKind = (kind: EntitlementKind): PurchaseReceiptKind =>
  kind === "report_once" ? "once" : "continued";

const purchaseReportUrl = (siteUrl: string, businessId: string): string => {
  const { origin } = new URL(siteUrl);
  return `${origin}/${encodeURIComponent(businessId)}`;
};

const missingCheck = (): CheckResult =>
  checkResultSchema.parse({
    label: "This check could not run",
    type: "check",
    value: null,
  });

const sourceChecks = (
  definitions: readonly CheckDefinition[],
  results: Record<string, CheckResult>
) =>
  definitions.map((definition) => {
    const result = results[definition.id] ?? missingCheck();
    return {
      category: definition.channelCategory,
      definition,
      label: result.label,
      status: statusFromResult(result),
      title: definition.title,
    };
  });

const onceReportPdf = async (
  business: Business
): Promise<{ bytes: Uint8Array; filename: string } | null> => {
  const definitions = checksForCategory(business.category);
  const batch = await runBusinessCheckBatch(business, {
    reuseStoredQueued: true,
  });
  const checks = sourceChecks(definitions, batch.results);
  const completed = checks.flatMap((check) => {
    if (
      check.status !== "pass" &&
      check.status !== "fail" &&
      check.status !== "error"
    ) {
      return [];
    }
    return [
      completedCheckSchema.parse({
        channelCategory: check.category,
        id: check.definition.id,
        points: pointsFor(check.definition, business.category),
        status: check.status,
        title: check.title,
        ...(check.label ? { label: check.label } : {}),
      }),
    ];
  });
  const summary = buildFallbackSummary(
    completed,
    completed.length === 0 ? "no_completed_checks" : "ai_binding_missing"
  );
  const counts = visibilityCounts(checks);
  const payload = reportPdfPayload({
    businessName: business.name,
    checks,
    counts,
    fixPlan: planNextActions({
      actions: summary.nextActions,
      category: business.category,
      definitions,
    }),
    overview: summary.overview,
    showFixSteps: true,
    visibilityScore: scorePercent(counts),
  });
  return {
    bytes: buildReportPdf(payload),
    filename: reportPdfFilename(business.name, "final"),
  };
};

const readWorkerUseSendConfig = async (): Promise<UseSendConfig | null> => {
  const workerEnv = await getCloudflareEnv();
  return readUseSendConfig({
    USESEND_API_KEY: workerEnv?.USESEND_API_KEY ?? process.env.USESEND_API_KEY,
    USESEND_BASE_URL:
      workerEnv?.USESEND_BASE_URL ?? process.env.USESEND_BASE_URL,
    USESEND_FROM: workerEnv?.USESEND_FROM ?? process.env.USESEND_FROM,
  });
};

export const purchaseReceiptContent = (input: {
  businessName: string;
  kind: EntitlementKind;
  pdf: { bytes: Uint8Array; filename: string } | null;
  reportUrl: string;
  siteUrl: string;
}): {
  attachments: UseSendAttachment[];
  html: string;
  subject: string;
  text: string;
} => {
  const kind = entitlementKindSchema.parse(input.kind);
  const pdfAttached = kind === "report_once" && input.pdf !== null;
  const rendered = renderPurchaseReceiptEmail({
    businessName: input.businessName,
    kind: receiptKind(kind),
    pdfAttached,
    reportUrl: input.reportUrl,
    siteUrl: input.siteUrl,
  });
  const attachments =
    pdfAttached && input.pdf
      ? [
          {
            content: bytesToBase64(input.pdf.bytes),
            filename: input.pdf.filename,
          },
        ]
      : [];
  return { attachments, ...rendered };
};

const loadPdf = async (
  kind: EntitlementKind,
  business: Business | null
): Promise<{ bytes: Uint8Array; filename: string } | null> => {
  if (kind !== "report_once" || !business) {
    return null;
  }
  try {
    return await onceReportPdf(business);
  } catch (error) {
    console.error("purchase receipt: could not build report PDF", error);
    return null;
  }
};

const releasePurchaseReceipt = async (
  businessId: string,
  kind: EntitlementKind
): Promise<void> => {
  try {
    await releasePurchaseEmail(businessId, kind);
  } catch (error) {
    console.error("purchase receipt: could not release send claim", error);
  }
};

const deliverPurchaseReceipt = async (input: {
  businessId: string;
  email: string;
  kind: EntitlementKind;
}): Promise<void> => {
  const email = emailSchema.safeParse(input.email.trim());
  if (!email.success) {
    console.error("purchase receipt skipped: invalid email");
    return;
  }
  const kind = entitlementKindSchema.parse(input.kind);
  let claimed = false;
  try {
    const config = await readWorkerUseSendConfig();
    if (!config) {
      console.error("purchase receipt: UseSend is not configured");
      return;
    }
    const business = await getBusiness(input.businessId);
    const siteUrl = listwellSiteUrl();
    const content = purchaseReceiptContent({
      businessName: business?.name ?? "",
      kind,
      pdf: await loadPdf(kind, business),
      reportUrl: purchaseReportUrl(siteUrl, input.businessId),
      siteUrl,
    });
    claimed = await claimPurchaseEmail(input.businessId, kind);
    if (!claimed) {
      return;
    }
    const sent = await sendUseSendEmail(config, {
      attachments: content.attachments,
      html: content.html,
      subject: content.subject,
      text: content.text,
      to: email.data,
    });
    if (!sent) {
      claimed = false;
      await releasePurchaseReceipt(input.businessId, kind);
    }
  } catch (error) {
    console.error("purchase receipt failed", error);
    if (claimed) {
      await releasePurchaseReceipt(input.businessId, kind);
    }
  }
};

export const schedulePurchaseReceipt = async (input: {
  businessId: string;
  email: string;
  kind: EntitlementKind;
}): Promise<void> => {
  try {
    const execution = await getExecutionContext();
    const run = deliverPurchaseReceipt(input);
    if (execution) {
      execution.waitUntil(run);
      return;
    }
    await run;
  } catch (error) {
    console.error("purchase receipt scheduling failed", error);
  }
};
