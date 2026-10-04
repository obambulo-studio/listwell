import { ButtonLink } from "@/components/atoms/button";
import { OpenProfileDialog, ProfileBackLink } from "@/components/profile-form";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profile",
};

const ProfilePage = async () => {
  const user = await getSessionUser();
  if (!user) {
    return (
      <section className="listwell-page">
        <ProfileBackLink />
        <div className="listwell-panel">
          <div className="listwell-panel__head">
            <h1 className="listwell-panel__title">Profile</h1>
          </div>
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
        </div>
      </section>
    );
  }

  return <OpenProfileDialog />;
};

export default ProfilePage;
