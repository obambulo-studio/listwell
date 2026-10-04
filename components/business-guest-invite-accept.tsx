"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { ButtonLink } from "@/components/atoms/button";
import { PrimaryButton } from "@/components/listwell/actions";
import { apiErrorSchema } from "@/lib/schema";

const acceptResponseSchema = z.object({
  alreadyAccepted: z.boolean(),
  businessExternalId: z.string(),
});

export const BusinessGuestInviteAccept = ({
  inviteToken,
  signedIn,
  sessionEmail,
  inviteeEmail,
  businessName,
  businessExternalId,
  status,
}: {
  inviteToken: string;
  signedIn: boolean;
  sessionEmail: string | null;
  inviteeEmail: string;
  businessName: string;
  businessExternalId: string;
  status: "pending" | "active" | "revoked";
}) => {
  const { push } = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnPath = `/invite/${inviteToken}`;
  const signInHref = `/sign-in?return=${encodeURIComponent(returnPath)}`;
  const emailMatches =
    signedIn &&
    sessionEmail !== null &&
    sessionEmail.trim().toLowerCase() === inviteeEmail;

  const accept = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/invite/${inviteToken}/accept`, {
          credentials: "same-origin",
          method: "POST",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const parsed = apiErrorSchema.safeParse(payload);
          setError(
            parsed.success ? parsed.data.error : "Could not accept invite"
          );
          setBusy(false);
          return;
        }
        const result = acceptResponseSchema.parse(payload);
        push(`/${result.businessExternalId}`);
      } catch {
        setError("Could not accept invite");
        setBusy(false);
      }
    })();
  };

  if (status === "active" && signedIn && emailMatches) {
    return (
      <div className="listwell-panel__foot">
        <ButtonLink href={`/${businessExternalId}`} variant="primary">
          View report
        </ButtonLink>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="listwell-panel__foot">
        <ButtonLink href={signInHref} variant="primary">
          Sign in to accept
        </ButtonLink>
        <p className="listwell-panel__note">
          Use {inviteeEmail} when you sign in or create your account.
        </p>
      </div>
    );
  }

  if (!emailMatches) {
    return (
      <div className="listwell-panel__body">
        <p className="listwell-panel__text">
          You are signed in as {sessionEmail}. This invite was sent to{" "}
          {inviteeEmail}.
        </p>
        <div className="listwell-panel__foot">
          <ButtonLink href={signInHref} variant="primary">
            Switch account
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="listwell-panel__foot">
      {error ? (
        <p className="listwell-panel__note" role="alert">
          {error}
        </p>
      ) : null}
      <PrimaryButton
        disabled={busy}
        loading={busy}
        onClick={accept}
        type="button"
      >
        Accept invite for {businessName}
      </PrimaryButton>
      <p className="listwell-panel__note">
        Already have an account?{" "}
        <Link className="listwell-inline-link" href={signInHref}>
          Sign in
        </Link>
      </p>
    </div>
  );
};
