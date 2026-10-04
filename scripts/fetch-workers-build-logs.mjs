import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ACCOUNT_ID = "0139d167327c252643c7691dc8b25c33";
const buildUuid = process.argv.at(2);

if (!buildUuid) {
  console.error(
    "Usage: node scripts/fetch-workers-build-logs.mjs <build_uuid>\n" +
      "Build UUID is the last path segment of the Cloudflare build URL on the failed check."
  );
  process.exit(1);
}

const root = path.join(import.meta.dirname, "..");
const envFile = path.join(root, ".env.local");

const readEnvValue = (key) => {
  if (!existsSync(envFile)) {
    return "";
  }
  const line = readFileSync(envFile, "utf-8")
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : "";
};

const readAuthToken = () => {
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN ?? readEnvValue("CLOUDFLARE_API_TOKEN");
  if (apiToken) {
    return apiToken;
  }
  throw new Error(
    "Set CLOUDFLARE_API_TOKEN in .env.local or the environment (Workers CI Read scope is enough for logs)."
  );
};

const token = readAuthToken();
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/builds/${buildUuid}/logs`,
  { headers: { Authorization: `Bearer ${token}` } }
);
const payload = await response.json();
if (!response.ok || !payload.success) {
  const message =
    payload.errors?.map((error) => error.message).join("; ") ??
    response.statusText;
  throw new Error(message);
}

for (const line of payload.result?.lines ?? []) {
  if (Array.isArray(line) && line.length >= 2) {
    process.stdout.write(`${String(line[1])}\n`);
  }
}
