import { describe, expect, it } from "vitest";

import { purchaseReceiptContent } from "./purchase-email";
import { entitlementKindSchema } from "./schema";

const reportUrl = "https://listwell.dev/harbour-cafe";
const siteUrl = "https://listwell.dev";
const pdf = {
  bytes: new TextEncoder().encode("pdf-bytes"),
  filename: "harbour-cafe-visibility-report.pdf",
};

describe(purchaseReceiptContent, () => {
  it("attaches the PDF for a once-off purchase", () => {
    const receipt = purchaseReceiptContent({
      businessName: "Harbour Cafe",
      kind: entitlementKindSchema.parse("report_once"),
      pdf,
      reportUrl,
      siteUrl,
    });

    expect({
      attached: receipt.text.includes("The PDF is attached."),
      attachment: receipt.attachments[0]?.filename,
      content: receipt.attachments[0]?.content,
      link:
        receipt.text.includes(reportUrl) &&
        receipt.html.includes("View report"),
      subject: receipt.subject,
    }).toStrictEqual({
      attached: true,
      attachment: "harbour-cafe-visibility-report.pdf",
      content: btoa("pdf-bytes"),
      link: true,
      subject: "Your Listwell report for Harbour Cafe",
    });
  });

  it("sends a link without a PDF for monthly and yearly purchases", () => {
    const receipt = purchaseReceiptContent({
      businessName: "Harbour Cafe",
      kind: entitlementKindSchema.parse("report_monthly"),
      pdf,
      reportUrl,
      siteUrl,
    });

    expect(receipt.subject).toBe("Your Listwell reports for Harbour Cafe");
    expect(receipt.text).toContain(reportUrl);
    expect(receipt.text).not.toContain("PDF");
    expect(receipt.html).not.toContain("PDF");
    expect(receipt.attachments).toStrictEqual([]);
  });

  it("still links the report when the PDF could not be built", () => {
    const receipt = purchaseReceiptContent({
      businessName: "Harbour Cafe",
      kind: entitlementKindSchema.parse("report_once"),
      pdf: null,
      reportUrl,
      siteUrl,
    });

    expect(receipt.text).toContain(
      "Your full report for Harbour Cafe is ready."
    );
    expect(receipt.text).not.toContain("attached");
    expect(receipt.attachments).toStrictEqual([]);
  });
});
