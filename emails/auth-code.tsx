import { renderEmailHtml } from "./render-email";
import { EmailBodyLink, EmailShell, Headline, Lede, Quiet } from "./shell";

export const SIGN_IN_CODE_EXPIRES_MINUTES = 5;

export type AuthCodeType =
  | "change-email"
  | "email-verification"
  | "forget-password"
  | "sign-in";

const ledeFor = (type: AuthCodeType): string => {
  if (type === "change-email") {
    return "is your code to confirm this Listwell email.";
  }
  return "is your Listwell sign-in code.";
};

interface AuthCodeEmailProps {
  code: string;
  siteUrl: string;
  type?: AuthCodeType;
}

const authCodeCopy = (
  input: AuthCodeEmailProps
): {
  host: string;
  lede: string;
  siteUrl: string;
  subject: string;
  text: string;
} => {
  const siteUrl = new URL(input.siteUrl).origin;
  const { host } = new URL(siteUrl);
  const lede = ledeFor(input.type ?? "sign-in");
  const subject = `${input.code} ${lede.replace(/\.$/u, "")}`;
  const text = `${input.code} ${lede}

Never share this code or enter it anywhere other than the ${host} domain.

This code expires in ${SIGN_IN_CODE_EXPIRES_MINUTES} minutes.

If you didn't request this code, you can ignore this email.`;
  return { host, lede, siteUrl, subject, text };
};

export const AuthCodeEmail = (input: AuthCodeEmailProps) => {
  const copy = authCodeCopy(input);
  return (
    <EmailShell preheader={copy.subject} siteUrl={copy.siteUrl}>
      <Headline>{input.code}</Headline>
      <Lede>{copy.lede}</Lede>
      <Quiet marginTop="28px">
        Never share this code or enter it anywhere other than the{" "}
        <EmailBodyLink href={copy.siteUrl}>{copy.host}</EmailBodyLink> domain.
      </Quiet>
      <Quiet>
        This code expires in {SIGN_IN_CODE_EXPIRES_MINUTES} minutes.
      </Quiet>
      <Quiet>
        If you did not request this code, you can ignore this email.
      </Quiet>
    </EmailShell>
  );
};

const signInPreview = {
  code: "772602",
  siteUrl: "https://listwell.dev",
  type: "sign-in",
} satisfies AuthCodeEmailProps;

export default Object.assign(AuthCodeEmail, { PreviewProps: signInPreview });

export const changeEmailPreview = {
  code: "445566",
  siteUrl: "https://listwell.dev",
  type: "change-email",
} satisfies AuthCodeEmailProps;

export const renderAuthCodeEmail = (
  input: AuthCodeEmailProps
): { html: string; subject: string; text: string } => {
  const copy = authCodeCopy(input);
  return {
    html: renderEmailHtml(<AuthCodeEmail {...input} />),
    subject: copy.subject,
    text: copy.text,
  };
};
