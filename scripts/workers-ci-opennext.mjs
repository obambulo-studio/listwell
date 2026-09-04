import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (process.env.WORKERS_CI !== "1") {
  process.exit(0);
}
if (process.env.LISTWELL_OPENNEXT_PACKAGING === "1") {
  process.exit(0);
}

const workerPath = ".open-next/worker.js";
const workerIsPlaceholder =
  existsSync(workerPath) && readFileSync(workerPath, "utf8").includes('new Response("Listwell"');
if (existsSync(workerPath) && !workerIsPlaceholder) {
  process.exit(0);
}

const cli = fileURLToPath(new URL("../node_modules/@opennextjs/cloudflare/dist/cli/index.js", import.meta.url));
const result = spawnSync(process.execPath, [cli, "build", "--skipNextBuild"], {
  stdio: "inherit",
  env: { ...process.env, LISTWELL_OPENNEXT_PACKAGING: "1" },
});

process.exit(result.status ?? 1);
