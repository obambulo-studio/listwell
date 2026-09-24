import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    coverage: {
      include: ["lib/**/*.ts", "app/api/**/route.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        branches: 50,
        functions: 50,
        lines: 50,
        statements: 50,
      },
    },
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
