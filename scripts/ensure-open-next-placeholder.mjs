import { mkdirSync, writeFileSync, existsSync } from "node:fs";

mkdirSync(".open-next/assets", { recursive: true });

if (existsSync(".open-next/worker.js")) {
  process.exit(0);
}

writeFileSync(
  ".open-next/worker.js",
  `export default {
  async fetch() {
    return new Response("Listwell", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
`,
);
