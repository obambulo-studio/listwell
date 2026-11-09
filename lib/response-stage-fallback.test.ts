import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  emptyStageUnavailable,
  isEmptyStageUnavailable,
  recoverEmptyStageUnavailable,
  resolveStageLoopback,
  STAGE_FALLBACK_WARNING,
} from "./response-stage-fallback";
import {
  patchCdnAdapterWorkerSource,
  RESPONSE_STAGE_FALLBACK_MODULE,
  RESPONSE_STAGE_PATCH_MARKER,
} from "./response-stage-worker-patch";

const homepageUrl = "https://listwell.dev/";

const homepageResponse = (): Response =>
  new Response("<html>listwell</html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: 200,
  });

const renderedHomepage = (): Promise<Response> =>
  Promise.resolve(homepageResponse());

const failClosedJson = (): Response =>
  Response.json(
    { error: "Checkout is not available right now." },
    { status: 503 }
  );

// Vinext strips a HEAD body after the response stage returns.
const finishHead = (response: Response): Response => {
  if (response.body === null) {
    return response;
  }
  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const expectWarning = async (
  run: () => Promise<Response>
): Promise<Response> => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {
    /* Silence the stage fallback warning. */
  });
  try {
    const response = await run();
    expect(warn).toHaveBeenCalledWith(STAGE_FALLBACK_WARNING);
    return response;
  } finally {
    warn.mockRestore();
  }
};

describe(isEmptyStageUnavailable, () => {
  it("matches the vinext stage mismatch response", () => {
    expect(isEmptyStageUnavailable(emptyStageUnavailable())).toBeTruthy();
  });

  it("ignores a fail-closed JSON 503", () => {
    expect(isEmptyStageUnavailable(failClosedJson())).toBeFalsy();
  });

  it("ignores an empty 503 that already carries a build id", () => {
    const stamped = emptyStageUnavailable();
    stamped.headers.set("x-vinext-build-id", "build-a");
    expect(isEmptyStageUnavailable(stamped)).toBeFalsy();
  });
});

describe(resolveStageLoopback, () => {
  it("renders GET / when the loopback returns an empty 503", async () => {
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const response = await expectWarning(() =>
      resolveStageLoopback(
        { kind: "response", response: emptyStageUnavailable() },
        render,
        false
      )
    );
    expect(render).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("<html>listwell</html>");
    expect(new URL(homepageUrl).pathname).toBe("/");
  });

  it("renders HEAD / and returns headers without a body", async () => {
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const recovered = await expectWarning(() =>
      resolveStageLoopback(
        { kind: "response", response: emptyStageUnavailable() },
        render,
        false
      )
    );
    const response = finishHead(recovered);
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
  });

  it("renders when the response-stage binding is missing", async () => {
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const response = await expectWarning(() =>
      resolveStageLoopback({ kind: "missing" }, render, false)
    );
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("listwell");
  });

  it("keeps the empty 503 for a readiness probe", async () => {
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const response = await resolveStageLoopback(
      { kind: "response", response: emptyStageUnavailable() },
      render,
      true
    );
    expect(render).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.body).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps a readiness miss when the binding is absent", async () => {
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const response = await resolveStageLoopback(
      { kind: "missing" },
      render,
      true
    );
    expect(render).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.body).toBeNull();
  });

  it("does not render again for a fail-closed JSON 503", async () => {
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const blocked = failClosedJson();
    const response = await resolveStageLoopback(
      { kind: "response", response: blocked },
      render,
      false
    );
    expect(render).not.toHaveBeenCalled();
    expect(response).toBe(blocked);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Checkout is not available right now.",
    });
  });

  it("returns one persistent empty 503 from the in-process render", async () => {
    const render = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(emptyStageUnavailable())
    );
    const response = await expectWarning(() =>
      recoverEmptyStageUnavailable(emptyStageUnavailable(), render)
    );
    expect(render).toHaveBeenCalledOnce();
    expect(response.status).toBe(503);
    expect(response.body).toBeNull();
  });

  it("leaves a successful stage response unchanged", async () => {
    const page = homepageResponse();
    const render = vi.fn<() => Promise<Response>>(renderedHomepage);
    const response = await resolveStageLoopback(
      { kind: "response", response: page },
      render,
      false
    );
    expect(render).not.toHaveBeenCalled();
    expect(response).toBe(page);
  });
});

describe(patchCdnAdapterWorkerSource, () => {
  const adapterPath = path.join(
    import.meta.dirname,
    "../node_modules/@vinext/cloudflare/dist/cache/cdn-adapter.worker.js"
  );

  it("patches the installed vinext CDN adapter once", () => {
    const source = readFileSync(adapterPath, "utf-8");
    const patched = patchCdnAdapterWorkerSource(source);
    expect(patched).toContain(RESPONSE_STAGE_PATCH_MARKER);
    expect(patched).toContain(
      `import { resolveStageLoopback } from ${JSON.stringify(RESPONSE_STAGE_FALLBACK_MODULE)};`
    );
    expect(patched).toContain('kind: "missing"');
    expect(patched).toContain('kind: "response"');
    expect(patched).not.toContain(
      "if (!binding) return responseStageUnavailable();"
    );
  });

  it("leaves an already patched adapter unchanged", () => {
    const source = readFileSync(adapterPath, "utf-8");
    const patched = patchCdnAdapterWorkerSource(source);
    expect(patchCdnAdapterWorkerSource(patched)).toBe(patched);
  });

  it("parses the patched adapter as a script", () => {
    const source = readFileSync(adapterPath, "utf-8");
    const patched = patchCdnAdapterWorkerSource(source);
    const directory = mkdtempSync(path.join(tmpdir(), "listwell-stage-"));
    const file = path.join(directory, "worker.js");
    writeFileSync(file, patched);
    const check = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf-8",
    });
    expect(check.status).toBe(0);
  });

  it("refuses a CDN adapter that does not contain the loopback", () => {
    expect(() => patchCdnAdapterWorkerSource("export default {}")).toThrow(
      /response-stage loopback/u
    );
  });
});
