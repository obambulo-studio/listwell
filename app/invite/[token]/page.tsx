import { notFound } from "next/navigation";
import { z } from "zod";

import { BusinessGuestInviteAccept } from "@/components/business-guest-invite-accept";
import { getSessionUser } from "@/lib/auth";
import { api, convexPublicQuery } from "@/lib/convex/server";
import { businessGuestInvitePreviewSchema } from "@/lib/schema";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  token: z.string().min(16),
});

export const metadata = {
  title: "Business invite",
};

const InvitePage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = paramsSchema.parse(await params);
  const previewRaw = await convexPublicQuery(
    api.businessGuests.previewByToken,
    { token }
  );
  const previewParsed = businessGuestInvitePreviewSchema.safeParse(previewRaw);
  if (!previewParsed.success) {
    notFound();
  }
  const preview = previewParsed.data;

  const sessionUser = await getSessionUser();

  return (
    <section className="listwell-page">
      <div className="listwell-panel">
        <div className="listwell-panel__head">
          <h1 className="listwell-panel__title">Team access invite</h1>
        </div>
        <div className="listwell-panel__body">
          <p className="listwell-panel__text">
            You have been invited to view{" "}
            <strong>{preview.businessName}</strong> on Listwell.
          </p>
          <p className="listwell-panel__note">
            You will only see this business report, not the owner&apos;s other
            businesses or billing.
          </p>
        </div>
        <BusinessGuestInviteAccept
          businessExternalId={preview.businessExternalId}
          businessName={preview.businessName}
          inviteToken={token}
          inviteeEmail={preview.inviteeEmail}
          sessionEmail={sessionUser?.email ?? null}
          signedIn={sessionUser !== null}
          status={preview.status}
        />
      </div>
    </section>
  );
};

export default InvitePage;
