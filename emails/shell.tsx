import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Column,
  Preview,
  Row,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

export const emailFont =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * Hex fallbacks for Listwell tokens in `app/beautifui/foundation.css`
 * (email clients do not reliably support oklch).
 */
export const emailInk = "#111111";
export const emailMuted = "#666666";
export const emailFooterInk = "#c4c4c4";
export const emailRule = "#eeeeee";
/** Listwell baby blue — mark bar and primary buttons in email. */
export const emailBabyBlue = "#89cff0";
/** Brand accent — mark bar, primary button fill. */
export const emailAccent = emailBabyBlue;
/** Body inline links (readable on white). */
export const emailLinkColor = "#245fd4";
/** Label on baby-blue buttons (dark blue, not black). */
export const emailOnAccent = "#1a5276";

const textStyle = {
  fontFamily: emailFont,
} satisfies CSSProperties;

export const emailLinkStyle = {
  ...textStyle,
  color: emailLinkColor,
  textDecoration: "underline",
  textDecorationLine: "underline",
} satisfies CSSProperties;

export const emailFooterBrandLinkStyle = {
  ...textStyle,
  color: emailFooterInk,
  textDecoration: "none",
} satisfies CSSProperties;

export const emailFooterUtilityLinkStyle = {
  ...textStyle,
  color: emailMuted,
  fontSize: "13px",
  lineHeight: "20px",
  textDecoration: "underline",
} satisfies CSSProperties;

export const primaryButtonStyle = {
  backgroundColor: emailAccent,
  borderRadius: "6px",
  boxSizing: "border-box",
  color: emailOnAccent,
  display: "block",
  fontFamily: emailFont,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "15px",
  margin: "12px 0 0",
  maxWidth: "280px",
  padding: "12px 20px",
  textAlign: "center",
  textDecoration: "none",
  width: "100%",
} satisfies CSSProperties;

export const subheadStyle = {
  ...textStyle,
  color: emailInk,
  fontSize: "16px",
  fontWeight: 600,
  lineHeight: "22px",
  margin: "0",
} satisfies CSSProperties;

const RoundedTopMark = () => (
  <table
    aria-hidden="true"
    border={0}
    cellPadding={0}
    cellSpacing={0}
    role="presentation"
  >
    <tbody>
      <tr>
        <td aria-hidden="true" style={{ padding: "0 0 32px" }}>
          <table border={0} cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td
                  height={36}
                  style={{
                    backgroundColor: emailAccent,
                    borderTopLeftRadius: "10px",
                    borderTopRightRadius: "10px",
                    fontSize: "0",
                    height: "36px",
                    lineHeight: "36px",
                    width: "20px",
                  }}
                  width={20}
                >
                  &nbsp;
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
);

export const EmailShell = ({
  children,
  footerNote,
  preheader,
  siteUrl,
  trailing,
}: {
  children: ReactNode;
  footerNote?: string;
  preheader: string;
  siteUrl: string;
  trailing?: ReactNode;
}) => {
  const { host } = new URL(siteUrl);

  return (
    <Html lang="en-AU">
      <Head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>Listwell</title>
      </Head>
      <Body
        style={{
          backgroundColor: "#ffffff",
          color: emailInk,
          fontFamily: emailFont,
          margin: 0,
          padding: "48px 40px 32px",
          textAlign: "left",
        }}
      >
        <Preview>{preheader}</Preview>
        <Container align="left" style={{ margin: "0", maxWidth: "560px" }}>
          <RoundedTopMark />
          {children}
          <Hr
            style={{
              border: "none",
              borderTop: `1px solid ${emailRule}`,
              margin: "40px 0 20px",
            }}
          />
          <Row>
            <Column style={{ verticalAlign: "middle", width: "60%" }}>
              <Link
                href={siteUrl}
                rel="noopener noreferrer"
                style={{
                  ...emailFooterBrandLinkStyle,
                  fontSize: "18px",
                  fontWeight: 500,
                  lineHeight: "24px",
                }}
              >
                Listwell
              </Link>
            </Column>
            <Column
              align="right"
              style={{
                textAlign: "right",
                verticalAlign: "middle",
                width: "40%",
              }}
            >
              {trailing ?? (
                <Link
                  href={siteUrl}
                  rel="noopener noreferrer"
                  style={{
                    ...emailFooterBrandLinkStyle,
                    fontSize: "13px",
                    lineHeight: "20px",
                  }}
                >
                  {host}
                </Link>
              )}
            </Column>
          </Row>
          {footerNote ? (
            <Text
              style={{
                ...textStyle,
                color: emailMuted,
                fontSize: "12px",
                lineHeight: "18px",
                margin: "12px 0 0",
              }}
            >
              {footerNote}
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
};

export const Headline = ({ children }: { children: ReactNode }) => (
  <Text
    style={{
      ...textStyle,
      color: emailInk,
      fontSize: "32px",
      fontWeight: 700,
      letterSpacing: "-0.03em",
      lineHeight: "1.15",
      margin: "0",
    }}
  >
    {children}
  </Text>
);

export const Lede = ({ children }: { children: ReactNode }) => (
  <Text
    style={{
      ...textStyle,
      color: emailInk,
      fontSize: "16px",
      fontWeight: 400,
      lineHeight: "24px",
      margin: "20px 0 0",
    }}
  >
    {children}
  </Text>
);

export const Quiet = ({
  children,
  marginTop = "16px",
}: {
  children: ReactNode;
  marginTop?: string;
}) => (
  <Text
    style={{
      ...textStyle,
      color: emailMuted,
      fontSize: "15px",
      lineHeight: "22px",
      margin: `${marginTop} 0 0`,
    }}
  >
    {children}
  </Text>
);

export const Subhead = ({ children }: { children: ReactNode }) => (
  <Text style={subheadStyle}>{children}</Text>
);

export const EmailBodyLink = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) => (
  <Link href={href} rel="noopener noreferrer" style={emailLinkStyle}>
    {children}
  </Link>
);

export const PrimaryButton = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) => (
  <Button href={href} rel="noopener noreferrer" style={primaryButtonStyle}>
    {children}
  </Button>
);

export const EmailPreferencesTrailing = ({
  unsubscribeUrl,
}: {
  unsubscribeUrl: string;
}) => (
  <Text
    style={{
      fontFamily: emailFont,
      fontSize: "13px",
      lineHeight: "20px",
      margin: 0,
      textAlign: "right",
    }}
  >
    <Link
      href={unsubscribeUrl}
      rel="noopener noreferrer"
      style={emailFooterUtilityLinkStyle}
    >
      Email preferences
    </Link>
    <span style={{ color: emailFooterInk }}> · </span>
    <Link
      href={unsubscribeUrl}
      rel="noopener noreferrer"
      style={emailFooterUtilityLinkStyle}
    >
      Unsubscribe
    </Link>
  </Text>
);
