import { PrimaryButton } from "@/components/listwell/actions";

export const metadata = {
  title: "Unsubscribe",
};

const tokenMinLength = 8;

const UnsubscribePage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const params = await searchParams;
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!token || token.length < tokenMinLength) {
    return (
      <section className="listwell-page">
        <div className="listwell-panel">
          <div className="listwell-panel__head">
            <h1 className="listwell-panel__title">Invalid unsubscribe link</h1>
          </div>
          <div className="listwell-panel__body">
            <p className="listwell-panel__text">
              Use the link from your Listwell scan email.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="listwell-page">
      <form
        className="listwell-panel"
        method="post"
        action="/api/notifications/unsubscribe"
      >
        <div className="listwell-panel__head">
          <h1 className="listwell-panel__title">Monthly scan emails</h1>
        </div>
        <div className="listwell-panel__body listwell-panel__body--tight">
          <p className="listwell-panel__question">
            Unsubscribe from monthly scan emails?
          </p>
          <p className="listwell-panel__note">
            You will still be able to sign in and view reports.
          </p>
        </div>
        <div className="listwell-panel__foot">
          <input type="hidden" name="token" value={token} />
          <PrimaryButton type="submit">Confirm unsubscribe</PrimaryButton>
        </div>
      </form>
    </section>
  );
};

export default UnsubscribePage;
