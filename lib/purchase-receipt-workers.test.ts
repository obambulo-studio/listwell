import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { createBuilder, resolveConfig } from "vite";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { renderPurchaseReceiptEmail } from "../emails/purchase-ready";
import { emailReactDomServerEdge } from "../vite.config";

const receiptProps = {
  businessName: "Harbour Cafe",
  kind: "once",
  pdfAttached: true,
  reportUrl: "https://listwell.dev/harbour-cafe",
  siteUrl: "https://listwell.dev",
} as const;

const renderedReceiptSchema = z.object({
  html: z.string(),
  subject: z.string(),
  text: z.string(),
});

interface MiniflareInstance {
  dispatchFetch: (input: string) => Promise<Response>;
  dispose: () => Promise<void>;
}

const miniflareSchema = z.object({
  Miniflare: z.custom<new (options: unknown) => MiniflareInstance>(
    (value) => typeof value === "function"
  ),
});

const workerEntrySource = (
  purchaseReadyPath: string
): string => `import { renderPurchaseReceiptEmail } from ${JSON.stringify(purchaseReadyPath)};

const input = ${JSON.stringify(receiptProps)};

export default {
  async fetch() {
    const rendered = renderPurchaseReceiptEmail(input);
    return Response.json({
      html: rendered.html,
      subject: rendered.subject,
      text: rendered.text,
    });
  },
};
`;

const rscConditions = async (root: string): Promise<readonly string[]> => {
  const resolved = await resolveConfig(
    { configFile: path.join(root, "vite.config.ts") },
    "build"
  );
  const conditions = resolved.environments.rsc?.resolve.conditions;
  if (!conditions?.includes("react-server")) {
    throw new Error("RSC environment is missing the react-server condition");
  }
  return conditions;
};

const bundleReceiptWorker = async (
  root: string,
  entryPath: string,
  outDir: string
): Promise<void> => {
  const conditions = await rscConditions(root);
  const builder = await createBuilder({
    configFile: false,
    environments: {
      rsc: {
        build: {
          emptyOutDir: true,
          minify: false,
          outDir,
          rolldownOptions: {
            input: entryPath,
            output: {
              entryFileNames: "worker.js",
              format: "es",
            },
          },
          sourcemap: false,
        },
        resolve: {
          conditions: [...conditions],
          noExternal: true,
        },
      },
    },
    logLevel: "warn",
    plugins: [emailReactDomServerEdge()],
    root,
  });
  const environment = builder.environments.rsc;
  if (!environment) {
    throw new Error("Receipt bundle did not create an RSC environment");
  }
  await builder.build(environment);
};

const manifestModules = async (
  outDir: string
): Promise<Record<string, { contents: string; type: "esm" }>> => {
  const entries = await readdir(outDir);
  const fileNames = entries.filter((name) => name.endsWith(".js"));
  const contents = await Promise.all(
    fileNames.map((name) => readFile(path.join(outDir, name), "utf-8"))
  );
  const modules: Record<string, { contents: string; type: "esm" }> = {};
  for (const [index, name] of fileNames.entries()) {
    const source = contents[index];
    if (source === undefined) {
      continue;
    }
    modules[name] = {
      contents: source,
      type: "esm",
    };
  }
  if (!modules["worker.js"]) {
    throw new Error("Receipt bundle did not emit worker.js");
  }
  return modules;
};

describe("purchase receipt on Workers", () => {
  it("renders the receipt from the RSC bundle inside workerd", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const directory = await mkdtemp(path.join(tmpdir(), "listwell-receipt-"));
    const entryPath = path.join(directory, "entry.ts");
    const outDir = path.join(directory, "dist");
    await writeFile(
      entryPath,
      workerEntrySource(path.join(root, "emails/purchase-ready.tsx"))
    );
    let worker: MiniflareInstance | undefined;
    try {
      await bundleReceiptWorker(root, entryPath, outDir);
      const require = createRequire(import.meta.resolve("wrangler"));
      const loaded: unknown = require("miniflare");
      const { Miniflare } = miniflareSchema.parse(loaded);
      worker = new Miniflare({
        workers: [
          {
            config: {
              compatibilityDate: "2026-10-09",
              compatibilityFlags: ["nodejs_compat"],
              manifest: {
                mainModule: "worker.js",
                modules: await manifestModules(outDir),
              },
              name: "receipt",
            },
          },
        ],
      });
      const response = await worker.dispatchFetch("https://listwell.test/");
      const payload: unknown = await response.json();
      const rendered = renderedReceiptSchema.parse(payload);
      const expected = renderPurchaseReceiptEmail(receiptProps);
      expect(response.status).toBe(200);
      expect(rendered).toStrictEqual({
        html: expected.html,
        subject: expected.subject,
        text: expected.text,
      });
      expect(rendered.html).toContain("Report ready");
      expect(rendered.html).toContain("View report");
      expect(rendered.html).toContain(receiptProps.reportUrl);
    } finally {
      await worker?.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  }, 60_000);
});
