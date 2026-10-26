import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

import { isProbePath, probeNotFoundResponse } from "./probe-paths";

const repoRoot = path.resolve(import.meta.dirname, "..");
const validReportId = "3f2b8c1e-7a4d-4e6b-9c0a-1d2e3f4a5b6c";

const probePaths = [
  "/xmlrpc.php",
  "/.env",
  "/wp-login.php",
  "/wp-admin",
  "/wp-admin/setup-config.php",
  "/.git/config",
  "/phpinfo.php",
  "/config.json",
  "/WP-LOGIN.PHP",
  "/%2Eenv",
];

const routedPaths = [
  "/",
  `/${validReportId}`,
  `/${validReportId}/edit`,
  "/share/abcdefghijklmnopqrstuvwxyz",
  "/account",
  "/api/health",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/auth.md",
  "/favicon.svg",
  "/favicon.ico",
  "/lw-analytics.js",
  "/og.png",
  "/.well-known/api-catalog",
  "/.well-known/mcp/server-card.json",
];

describe(isProbePath, () => {
  it.each(probePaths)("treats %s as a probe", (pathname) => {
    expect(isProbePath(pathname)).toBeTruthy();
  });

  it.each(routedPaths)("routes %s normally", (pathname) => {
    expect(isProbePath(pathname)).toBeFalsy();
  });

  it("never blocks a file in public/", () => {
    const publicFiles = readdirSync(path.join(repoRoot, "public"));
    for (const file of publicFiles) {
      expect({ file, probe: isProbePath(`/${file}`) }).toStrictEqual({
        file,
        probe: false,
      });
    }
  });

  it("never blocks a top-level app route with a dot", () => {
    const appEntries = readdirSync(path.join(repoRoot, "app"), {
      withFileTypes: true,
    });
    const dottedRoutes = appEntries.filter(
      (entry) => entry.isDirectory() && entry.name.includes(".")
    );
    expect(dottedRoutes.length).toBeGreaterThan(0);
    for (const entry of dottedRoutes) {
      expect({
        name: entry.name,
        probe: isProbePath(`/${entry.name}`),
      }).toStrictEqual({ name: entry.name, probe: false });
    }
  });

  it("never blocks the generated sitemap", () => {
    expect(existsSync(path.join(repoRoot, "app", "sitemap.ts"))).toBeTruthy();
    expect(isProbePath("/sitemap.xml")).toBeFalsy();
  });
});

describe(probeNotFoundResponse, () => {
  it("returns a plain 404", async () => {
    const response = probeNotFoundResponse("GET");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8"
    );
    await expect(response.text()).resolves.toBe("Not found");
  });

  it("returns no body for HEAD", async () => {
    const response = probeNotFoundResponse("HEAD");
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("");
  });
});

describe("proxy probe handling", () => {
  it("answers an invalid probe id with a 404 before routing", async () => {
    const response = await proxy(
      new NextRequest("https://listwell.dev/xmlrpc.php")
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-next")).toBeNull();
  });

  it("passes a valid report id through to the app", async () => {
    const response = await proxy(
      new NextRequest(`https://listwell.dev/${validReportId}`)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
