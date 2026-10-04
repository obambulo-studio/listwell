import { spawnSync } from "node:child_process";
import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import { workersCacheCdnAdapter } from "@vinext/cloudflare/cache/workers-cache-cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import vinext from "vinext";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const cloudflareWorkersClientStub = (): Plugin => ({
  applyToEnvironment(environment) {
    return environment.name === "client";
  },
  load(id) {
    if (id !== "\0cloudflare-workers-client-stub") {
      return;
    }
    return 'throw new Error("cloudflare:workers is not available in the browser");\n';
  },
  name: "cloudflare-workers-client-stub",
  resolveId(id) {
    if (id !== "cloudflare:workers") {
      return;
    }
    return "\0cloudflare-workers-client-stub";
  },
});

const reactDomServerEdge = path.join(
  import.meta.dirname,
  "node_modules/react-dom/server.edge.js"
);
const emailRenderer = path.join(import.meta.dirname, "emails/render-email.ts");

/** RSC remaps this specifier to a build without renderToStaticMarkup. */
const workersCiAfterBuild = (): Plugin => ({
  apply: "build",
  closeBundle: {
    handler: () => {
      spawnSync("node", ["scripts/after-cf-build.mjs"], {
        cwd: import.meta.dirname,
        stdio: "inherit",
      });
    },
    sequential: true,
  },
  name: "workers-ci-after-build",
});

const emailReactDomServerEdge = (): Plugin => ({
  enforce: "pre",
  name: "email-react-dom-server-edge",
  resolveId(id, importer) {
    const importerPath = importer?.split("?")[0];
    if (id !== "react-dom/server.edge" || importerPath !== emailRenderer) {
      return;
    }
    return reactDomServerEdge;
  },
});

export default defineConfig({
  build: {
    rolldownOptions: {
      external: ["cloudflare:workers"],
    },
  },
  plugins: [
    workersCiAfterBuild(),
    emailReactDomServerEdge(),
    cloudflareWorkersClientStub(),
    vinext({
      cache: { cdn: workersCacheCdnAdapter() },
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        childEnvironments: ["ssr"],
        name: "rsc",
      },
    }),
  ],
});
