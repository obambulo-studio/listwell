import { Section, Text } from "@react-email/components";
import type { CSSProperties } from "react";

import { renderEmailHtml } from "./render-email";
import {
  EmailPreferencesTrailing,
  EmailShell,
  emailFont,
  emailMuted,
  Headline,
  Lede,
  PrimaryButton,
  Quiet,
  Subhead,
} from "./shell";

export type ScanReadyScoreTrendDirection = "down" | "same" | "up";

export interface ScanReadyScoreTrend {
  arrow: string;
  direction: ScanReadyScoreTrendDirection;
  label: string;
}

export interface ScanReadyBusiness {
  businessId: string;
  businessName: string;
  profileUrl: string;
  scoreSummary: string;
  scoreTrend: ScanReadyScoreTrend | null;
}

const trendArrowColor = (direction: ScanReadyScoreTrendDirection): string => {
  if (direction === "up") {
    return "#2d8659";
  }
  if (direction === "down") {
    return "#b42318";
  }
  return emailMuted;
};

const trendArrowStyle = (
  direction: ScanReadyScoreTrendDirection
): CSSProperties => ({
  color: trendArrowColor(direction),
  fontFamily: emailFont,
  fontSize: "15px",
  fontWeight: 700,
  lineHeight: "22px",
});

const trendLabelStyle = {
  color: emailMuted,
  fontFamily: emailFont,
  fontSize: "15px",
  lineHeight: "22px",
} satisfies CSSProperties;

const ScoreTrendLine = ({
  marginTop,
  trend,
}: {
  marginTop: string;
  trend: ScanReadyScoreTrend;
}) => (
  <Text style={{ ...trendLabelStyle, margin: `${marginTop} 0 0` }}>
    {trend.arrow.length > 0 ? (
      <span aria-hidden="true" style={trendArrowStyle(trend.direction)}>
        {trend.arrow}
      </span>
    ) : null}
    {trend.arrow.length > 0 ? " " : null}
    {trend.label}
  </Text>
);

export interface ScanReadyEmailProps {
  businesses: readonly ScanReadyBusiness[];
  preheader: string;
  scanMonthLabel: string | null;
  siteUrl: string;
  unsubscribeUrl: string;
}

const footerBusinessList = (
  businesses: readonly ScanReadyBusiness[]
): string => {
  if (businesses.length === 1) {
    return `You're receiving this because you have Listwell monthly scans for ${businesses[0]?.businessName ?? "your business"}.`;
  }
  const names = businesses.map((business) => business.businessName).join(", ");
  return `You're receiving this because you have Listwell monthly scans for ${names}.`;
};

const BusinessScanRow = ({
  business,
  showName,
}: {
  business: ScanReadyBusiness;
  showName: boolean;
}) => (
  <Section style={{ margin: showName ? "28px 0 0" : "20px 0 0" }}>
    {showName ? <Subhead>{business.businessName}</Subhead> : null}
    <Quiet marginTop={showName ? "8px" : "0"}>{business.scoreSummary}</Quiet>
    {business.scoreTrend ? (
      <ScoreTrendLine marginTop="4px" trend={business.scoreTrend} />
    ) : null}
    <PrimaryButton href={business.profileUrl}>
      View {business.businessName}
    </PrimaryButton>
  </Section>
);

export const ScanReadyEmail = ({
  businesses,
  preheader,
  scanMonthLabel,
  siteUrl,
  unsubscribeUrl,
}: ScanReadyEmailProps) => {
  const multiple = businesses.length > 1;
  let headline = multiple ? "Scans ready" : "Scan ready";
  if (scanMonthLabel) {
    headline = multiple
      ? `${scanMonthLabel} scans ready`
      : `${scanMonthLabel} scan ready`;
  }
  const lede = multiple
    ? "Your monthly Listwell scans are ready. Each profile has a fresh report."
    : "Your monthly Listwell scan is ready. Your profile has a fresh report.";

  return (
    <EmailShell
      footerNote={footerBusinessList(businesses)}
      preheader={preheader}
      siteUrl={siteUrl}
      trailing={<EmailPreferencesTrailing unsubscribeUrl={unsubscribeUrl} />}
    >
      <Headline>{headline}</Headline>
      <Lede>{lede}</Lede>
      {businesses.map((business) => (
        <BusinessScanRow
          business={business}
          key={business.businessId}
          showName={multiple}
        />
      ))}
      <Quiet marginTop="24px">
        If you did not expect this email, you can ignore it.
      </Quiet>
    </EmailShell>
  );
};

export const scanReadyPreview = {
  businesses: [
    {
      businessId: "harbour-cafe",
      businessName: "Harbour Cafe",
      profileUrl: "https://listwell.dev/harbour-cafe",
      scoreSummary: "Visibility score: 72%",
      scoreTrend: {
        arrow: "\u2191",
        direction: "up",
        label: "Up 3 points from last month.",
      },
    },
  ],
  preheader: "Harbour Cafe scored 72% on the latest Listwell scan.",
  scanMonthLabel: "October",
  siteUrl: "https://listwell.dev",
  unsubscribeUrl: "https://listwell.dev/unsubscribe?token=sample",
} satisfies ScanReadyEmailProps;

export const scanReadyMultiPreview = {
  businesses: [
    {
      businessId: "harbour-cafe",
      businessName: "Harbour Cafe",
      profileUrl: "https://listwell.dev/harbour-cafe",
      scoreSummary: "Visibility score: 72%",
      scoreTrend: {
        arrow: "\u2191",
        direction: "up",
        label: "Up 3 points from last month.",
      },
    },
    {
      businessId: "bean-bar",
      businessName: "Bean Bar",
      profileUrl: "https://listwell.dev/bean-bar",
      scoreSummary: "Visibility score: 58%",
      scoreTrend: {
        arrow: "\u2193",
        direction: "down",
        label: "Down 5 points from last month.",
      },
    },
  ],
  preheader: "Your Listwell scans are ready for 2 businesses.",
  scanMonthLabel: "October",
  siteUrl: "https://listwell.dev",
  unsubscribeUrl: "https://listwell.dev/unsubscribe?token=sample",
} satisfies ScanReadyEmailProps;

export default Object.assign(ScanReadyEmail, {
  PreviewProps: scanReadyPreview,
});

export const renderScanReadyEmail = (input: ScanReadyEmailProps): string =>
  renderEmailHtml(<ScanReadyEmail {...input} />);
