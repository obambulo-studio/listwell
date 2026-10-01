import type { ReactNode } from "react";

import { ButtonLink } from "@/components/atoms/button";
import { ProfileBackLink, ProfileForm } from "@/components/profile-form";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profile",
};

const ProfileCard = ({ children }: { children: ReactNode }) => (
  <section className="listwell-page">
    <ProfileBackLink />
    <div className="listwell-panel">
      <div className="listwell-panel__head">
        <h1 className="listwell-panel__title">Profile</h1>
      </div>
      {children}
    </div>
  </section>
);

const ProfilePage = async () => {
  const user = await getSessionUser();
  if (!user) {
    return (
      <ProfileCard>
        <div className="listwell-panel__body">
          <p className="listwell-panel__text">
            Sign in to update your name and email.
          </p>
        </div>
        <div className="listwell-panel__foot">
          <ButtonLink
            variant="primary"
            href="/sign-in?return=%2Faccount%2Fprofile"
          >
            Sign in
          </ButtonLink>
        </div>
      </ProfileCard>
    );
  }

  return <ProfileForm email={user.email} name={user.name ?? ""} />;
};

export default ProfilePage;
