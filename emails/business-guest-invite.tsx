import { renderEmailHtml } from "./render-email";
import {
  EmailBodyLink,
  EmailShell,
  Headline,
  Lede,
  PrimaryButton,
  Quiet,
} from "./shell";

interface BusinessGuestInviteEmailProps {
  acceptUrl: string;
  businessName: string;
  siteUrl: string;
}

const inviteCopy = (input: BusinessGuestInviteEmailProps) => {
  const siteUrl = new URL(input.siteUrl).origin;
  const { host } = new URL(siteUrl);
  const subject = `View ${input.businessName} on Listwell`;
  const text = `You have been invited to view the ${input.businessName} report on Listwell.

Open this link to accept the invite:
${input.acceptUrl}

You will need to sign in with the email address this invite was sent to. You will not see billing or other businesses on the account.

If you were not expecting this invite, you can ignore this email.`;
  return { host, siteUrl, subject, text };
};

export const BusinessGuestInviteEmail = (
  input: BusinessGuestInviteEmailProps
) => {
  const copy = inviteCopy(input);
  return (
    <EmailShell preheader={copy.subject} siteUrl={copy.siteUrl}>
      <Headline>Guest access to {input.businessName}</Headline>
      <Lede>
        Someone invited you to view this business report on Listwell. Accept to
        see scores and status for this business only.
      </Lede>
      <PrimaryButton href={input.acceptUrl}>Accept invite</PrimaryButton>
      <Quiet marginTop="28px">
        Sign in with the email this invite was sent to. You will not see billing
        or other businesses on their account.
      </Quiet>
      <Quiet>
        If the button does not work, copy this link into your browser:{" "}
        <EmailBodyLink href={input.acceptUrl}>{input.acceptUrl}</EmailBodyLink>
      </Quiet>
      <Quiet>
        If you were not expecting this invite, you can ignore this email.
      </Quiet>
    </EmailShell>
  );
};

export const renderBusinessGuestInviteEmail = (
  input: BusinessGuestInviteEmailProps
): { html: string; subject: string; text: string } => {
  const copy = inviteCopy(input);
  return {
    html: renderEmailHtml(<BusinessGuestInviteEmail {...input} />),
    subject: copy.subject,
    text: copy.text,
  };
};
