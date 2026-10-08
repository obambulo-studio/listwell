import { AccountAgentConnect } from "@/components/account-agent-connect";
import { ButtonLink } from "@/components/atoms/button";
import { ProfileBackLink } from "@/components/profile-form";
import { listAgentApiKeysForUser } from "@/lib/agent-api-keys";
import { getSessionUser } from "@/lib/auth";
import { listwellSiteUrl } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MCP setup",
};

const AccountMcpPage = async () => {
  const user = await getSessionUser();
  const siteOrigin = listwellSiteUrl();

  if (!user) {
    return (
      <section className="listwell-page">
        <ProfileBackLink />
        <div className="listwell-panel">
          <div className="listwell-panel__head">
            <h1 className="listwell-panel__title">MCP setup</h1>
          </div>
          <div className="listwell-panel__body">
            <p className="listwell-panel__text">
              Sign in to create API keys and connect Listwell in Grok, Claude,
              Cursor, or any MCP client.
            </p>
          </div>
          <div className="listwell-panel__foot">
            <ButtonLink
              variant="primary"
              href="/sign-in?return=%2Faccount%2Fmcp"
            >
              Sign in
            </ButtonLink>
          </div>
        </div>
      </section>
    );
  }

  let initialKeys: Awaited<ReturnType<typeof listAgentApiKeysForUser>> = [];
  let initialKeysError: string | null = null;
  try {
    initialKeys = await listAgentApiKeysForUser(user.id);
  } catch {
    initialKeysError = "Could not load API keys.";
  }

  return (
    <section className="listwell-page">
      <ProfileBackLink />
      <AccountAgentConnect
        initialKeys={initialKeys}
        initialKeysError={initialKeysError}
        mcpUrl={`${siteOrigin}/mcp`}
      />
    </section>
  );
};

export default AccountMcpPage;
