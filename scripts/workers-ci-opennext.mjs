import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runNodeCli = (cliHref, args, extraEnv = {}) => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(cliHref), ...args],
    {
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    }
  );
  process.exit(result.status ?? 1);
};

const shouldPackageForWorkers =
  process.env.WORKERS_CI === "1" &&
  process.env.LISTWELL_OPENNEXT_PACKAGING !== "1";

if (shouldPackageForWorkers) {
  runNodeCli(
    new URL(
      "../node_modules/@opennextjs/cloudflare/dist/cli/index.js",
      import.meta.url
    ),
    ["build"],
    { LISTWELL_OPENNEXT_PACKAGING: "1" }
  );
}

runNodeCli(new URL("../node_modules/next/dist/bin/next", import.meta.url), [
  "build",
]);
