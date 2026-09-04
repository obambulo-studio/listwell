import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.WORKERS_CI !== "1") {
  process.exit(0);
}
if (process.env.LISTWELL_OPENNEXT_PACKAGING === "1") {
  process.exit(0);
}
if (existsSync(".open-next/worker.js")) {
  process.exit(0);
}

const result = spawnSync("opennextjs-cloudflare", ["build", "--skipNextBuild"], {
  stdio: "inherit",
  env: { ...process.env, LISTWELL_OPENNEXT_PACKAGING: "1" },
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
