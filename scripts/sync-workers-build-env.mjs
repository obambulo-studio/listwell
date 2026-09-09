import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

const ACCOUNT_ID = "0139d167327c252643c7691dc8b25c33";
const WORKER_SCRIPT_ID = "81106cf5a23946e28051caa2ac22b335";
const BUN_VERSION = "1.4.2";

const root = path.join(import.meta.dirname, "..");
const envFile = path.join(root, ".env.local");

const readEnvValue = (key) => {
  if (!existsSync(envFile)) {
    return "";
  }
  const line = readFileSync(envFile, "utf-8")
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) {
    return "";
  }
  return line.slice(key.length + 1);
};

const wranglerConfigPath = () => {
  if (platform() === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Preferences",
      ".wrangler",
      "config",
      "default.toml"
    );
  }
  return path.join(homedir(), ".wrangler", "config", "default.toml");
};

const readAuthToken = () => {
  const apiToken = readEnvValue("CLOUDFLARE_API_TOKEN");
  if (apiToken) {
    return apiToken;
  }

  const configPath = wranglerConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN in .env.local or run wrangler login (Workers CI Write scope required)."
    );
  }
  const match = readFileSync(configPath, "utf-8").match(
    /^oauth_token\s*=\s*"(?<token>[^"]+)"/mu
  );
  const token = match?.groups?.token;
  if (!token) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN in .env.local or run wrangler login (Workers CI Write scope required)."
    );
  }
  return token;
};

const cloudflareRequest = async (
  requestPath,
  { method = "GET", body } = {}
) => {
  const token = readAuthToken();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4${requestPath}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const message =
      payload.errors?.map((error) => error.message).join("; ") ??
      response.statusText;
    if (message.includes("Authentication error")) {
      throw new Error(
        `${message}. Create a Cloudflare API token with Workers CI Write, add CLOUDFLARE_API_TOKEN to .env.local, then rerun bun run cf:sync-build-env.`
      );
    }
    throw new Error(message);
  }
  return payload.result;
};

const readWranglerPublicVars = () => {
  const wranglerPath = path.join(root, "wrangler.jsonc");
  const wranglerFile = JSON.parse(
    readFileSync(wranglerPath, "utf-8").replaceAll(/,(?=\s*[}\]])/gu, "")
  );
  if (
    !wranglerFile ||
    typeof wranglerFile !== "object" ||
    !("vars" in wranglerFile)
  ) {
    return {};
  }
  const { vars } = wranglerFile;
  if (!vars || typeof vars !== "object") {
    return {};
  }
  return vars;
};

const buildVariables = () => {
  const wranglerVars = readWranglerPublicVars();
  const variables = {
    BUN_VERSION: { is_secret: false, value: BUN_VERSION },
    NEXTJS_ENV: { is_secret: false, value: "production" },
  };

  for (const key of [
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    const value = wranglerVars[key] ?? readEnvValue(key);
    if (typeof value === "string" && value) {
      variables[key] = { is_secret: false, value };
    }
  }

  return variables;
};

const listTriggers = () =>
  cloudflareRequest(
    `/accounts/${ACCOUNT_ID}/builds/workers/${WORKER_SCRIPT_ID}/triggers`
  );

const BUILD_COMMAND = "bun run cf:build";
const PRODUCTION_DEPLOY_COMMAND = "npx wrangler deploy --keep-vars";
const PREVIEW_DEPLOY_COMMAND = "npx wrangler versions upload --keep-vars";

const upsertBuildEnv = (triggerUuid, variables) =>
  cloudflareRequest(
    `/accounts/${ACCOUNT_ID}/builds/triggers/${triggerUuid}/environment_variables`,
    { body: variables, method: "PATCH" }
  );

const isPreviewTrigger = (trigger) => {
  const name = String(trigger.trigger_name ?? "").toLowerCase();
  if (name.includes("preview") || name.includes("non-production")) {
    return true;
  }
  const branches = Array.isArray(trigger.branch_includes)
    ? trigger.branch_includes
    : [];
  if (branches.includes("main")) {
    return false;
  }
  return branches.some((branch) => String(branch).includes("*"));
};

const updateTriggerCommands = (triggerUuid, deployCommand) =>
  cloudflareRequest(`/accounts/${ACCOUNT_ID}/builds/triggers/${triggerUuid}`, {
    body: {
      build_command: BUILD_COMMAND,
      deploy_command: deployCommand,
    },
    method: "PATCH",
  });

const variables = buildVariables();
const triggers = await listTriggers();

if (!Array.isArray(triggers) || triggers.length === 0) {
  throw new Error("No Workers Builds triggers found for listwell.");
}

const syncTrigger = async (trigger) => {
  const triggerUuid = trigger.trigger_uuid;
  const triggerName = trigger.trigger_name ?? triggerUuid;
  if (!triggerUuid) {
    return;
  }
  const deployCommand = isPreviewTrigger(trigger)
    ? PREVIEW_DEPLOY_COMMAND
    : PRODUCTION_DEPLOY_COMMAND;
  await updateTriggerCommands(triggerUuid, deployCommand);
  await upsertBuildEnv(triggerUuid, variables);
  console.log(
    `Build env synced for trigger: ${triggerName} (${BUILD_COMMAND} → ${deployCommand})`
  );
};

await Promise.all(triggers.map((trigger) => syncTrigger(trigger)));

console.log(
  `BUN_VERSION=${BUN_VERSION}, Next public vars, and OpenNext build/deploy commands are set on Workers Builds.`
);
