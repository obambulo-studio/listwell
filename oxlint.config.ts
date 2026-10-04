import convexPlugin from "@convex-dev/eslint-plugin";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, next, react, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "components/ui/**",
    "components/reui/**",
    "convex/_generated/**",
    "public/**",
  ],
  jsPlugins: ["@convex-dev/eslint-plugin"],
  overrides: [
    {
      files: ["**/convex/**/*.ts"],
      rules: {
        ...convexPlugin.configs.recommended[0].rules,
        // Convex module paths reject hyphens, so kebab-case file names cannot deploy.
        "unicorn/filename-case": "off",
      },
    },
  ],
});
