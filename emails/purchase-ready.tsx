import { renderEmailHtml } from "./render-email";
import {
  EmailBodyLink,
  EmailShell,
  Headline,
  Lede,
  PrimaryButton,
  Quiet,
} from "./shell";

export type PurchaseReceiptKind = "continued" | "once";

export interface PurchaseReceiptEmailProps {
  businessName: string;
  kind: PurchaseReceiptKind;
  pdfAttached: boolean;
  reportUrl: string;
  siteUrl: string;
}

const displayName = (businessName: string): string =>
  businessName.replaceAll(/\s+/gu, " ").trim();

const subjectFor = (once: boolean, name: string): string => {
  if (name.length === 0) {
    return once ? "Your Listwell report" : "Your Listwell reports";
  }
  return once
    ? `Your Listwell report for ${name}`
    : `Your Listwell reports for ${name}`;
};

const receiptCopy = (
  input: PurchaseReceiptEmailProps
): {
  footerNote: string;
  headline: string;
  lede: string;
  siteUrl: string;
  subject: string;
  text: string;
} => {
  const siteUrl = new URL(input.siteUrl).origin;
  const name = displayName(input.businessName);
  const once = input.kind === "once";
  const subject = subjectFor(once, name);
  const headline = once ? "Report ready" : "Reports ready";
  const owned = name.length > 0 ? name : "your business";
  let lede = once
    ? `Your full report for ${owned} is ready.`
    : `Your continued reports for ${owned} are ready.`;
  if (once && input.pdfAttached) {
    lede = `${lede} The PDF is attached.`;
  }
  const ignore = once
    ? "If you did not buy this report, you can ignore this email."
    : "If you did not buy these reports, you can ignore this email.";
  const footerNote = once
    ? `You're receiving this because you bought a Listwell report for ${owned}.`
    : `You're receiving this because you bought continued Listwell reports for ${owned}.`;
  const text = `${lede}

${input.reportUrl}

${ignore}`;
  return { footerNote, headline, lede, siteUrl, subject, text };
};

export const PurchaseReceiptEmail = (input: PurchaseReceiptEmailProps) => {
  const copy = receiptCopy(input);
  return (
    <EmailShell
      footerNote={copy.footerNote}
      preheader={copy.lede}
      siteUrl={copy.siteUrl}
    >
      <Headline>{copy.headline}</Headline>
      <Lede>{copy.lede}</Lede>
      <PrimaryButton href={input.reportUrl}>View report</PrimaryButton>
      <Quiet marginTop="16px">
        <EmailBodyLink href={input.reportUrl}>{input.reportUrl}</EmailBodyLink>
      </Quiet>
      <Quiet marginTop="24px">
        {input.kind === "once"
          ? "If you did not buy this report, you can ignore this email."
          : "If you did not buy these reports, you can ignore this email."}
      </Quiet>
    </EmailShell>
  );
};

const purchasePreview = {
  businessName: "Harbour Cafe",
  kind: "once",
  pdfAttached: true,
  reportUrl: "https://listwell.dev/harbour-cafe",
  siteUrl: "https://listwell.dev",
} satisfies PurchaseReceiptEmailProps;

export default Object.assign(PurchaseReceiptEmail, {
  PreviewProps: purchasePreview,
});

export const renderPurchaseReceiptEmail = (
  input: PurchaseReceiptEmailProps
): { html: string; subject: string; text: string } => {
  const copy = receiptCopy(input);
  return {
    html: renderEmailHtml(<PurchaseReceiptEmail {...input} />),
    subject: copy.subject,
    text: copy.text,
  };
};
