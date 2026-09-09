import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "2d1b0d0b11e44b3cf9177cd6fb703646";
const WORKER_SCRIPT_ID = "81106cf5a23946e28051caa2ac22b335";
const BUN_VERSION = "1.4.2";

const root = join(import.meta.dirname, "..");
const envFile = join(root, ".env.local");

function wranglerConfigPath() {
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml");
  }
  return join(homedir(), ".wrangler", "config", "default.toml");
}

function readAuthToken() {
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
  const match = readFileSync(configPath, "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(
      "Set CLOUDFLARE_API_TOKEN in .env.local or run wrangler login (Workers CI Write scope required)."
    );
  }
  return match[1];
}

function readEnvValue(key) {
  if (!existsSync(envFile)) {
    return "";
  }
  const line = readFileSync(envFile, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) {
    return "";
  }
  return line.slice(key.length + 1);
}

async function cloudflareRequest(path, { method = "GET", body } = {}) {
  const token = readAuthToken();
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const message = payload.errors?.map((error) => error.message).join("; ") ?? response.statusText;
    if (message.includes("Authentication error")) {
      throw new Error(
        `${message}. Create a Cloudflare API token with Workers CI Write, add CLOUDFLARE_API_TOKEN to .env.local, then rerun bun run cf:sync-build-env.`
      );
    }
    throw new Error(message);
  }
  return payload.result;
}

function buildVariables() {
  const variables = {
    BUN_VERSION: { value: BUN_VERSION, is_secret: false },
    NEXTJS_ENV: { value: "production", is_secret: false },
  };

  for (const key of [
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CONVEX_SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
  ]) {
    const value = readEnvValue(key);
    if (value) {
      variables[key] = { value, is_secret: false };
    }
  }

  return variables;
}

async function listTriggers() {
  return cloudflareRequest(
    `/accounts/${ACCOUNT_ID}/builds/workers/${WORKER_SCRIPT_ID}/triggers`
  );
}

async function upsertBuildEnv(triggerUuid, variables) {
  return cloudflareRequest(
    `/accounts/${ACCOUNT_ID}/builds/triggers/${triggerUuid}/environment_variables`,
    { method: "PATCH", body: variables }
  );
}

const variables = buildVariables();
const triggers = await listTriggers();

if (!Array.isArray(triggers) || triggers.length === 0) {
  throw new Error("No Workers Builds triggers found for listwell.");
}

for (const trigger of triggers) {
  const triggerUuid = trigger.trigger_uuid;
  const triggerName = trigger.trigger_name ?? triggerUuid;
  if (!triggerUuid) {
    continue;
  }
  await upsertBuildEnv(triggerUuid, variables);
  console.log(`Build env synced for trigger: ${triggerName}`);
}

console.log(`BUN_VERSION=${BUN_VERSION} and Next public vars are set on Workers Builds.`);
