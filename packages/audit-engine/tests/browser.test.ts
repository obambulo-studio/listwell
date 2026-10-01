import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createTinyFishFetchBudget,
  fetchWebsiteHtml,
  TINYFISH_RENDER_URL_CAP,
} from "../src/browser";

const tinyFishRequestSchema = z.object({
  format: z.string(),
  urls: z.array(z.string()),
});

const parseUnknownJson = (value: string): unknown => JSON.parse(value);

const fatHtml = `<!doctype html><html><head><title>Cafe</title></head><body>${"wood-fired menu item ".repeat(80)}</body></html>`;
const thinHtml = "<html><body>ok</body></html>";

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
};

describe(fetchWebsiteHtml, () => {
  it("keeps a full plain page and does not call TinyFish", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(requestUrl(input));
      return Promise.resolve(new Response(fatHtml, { status: 200 }));
    };

    const html = await fetchWebsiteHtml("https://cafe.example", {
      fetchImpl,
      tinyFish: createTinyFishFetchBudget("tf_test"),
    });

    expect(html).toBe(fatHtml);
    expect(calls).toStrictEqual(["https://cafe.example"]);
  });

  it("renders a thin page with TinyFish Fetch and skips Browser Rendering", async () => {
    const calls: string[] = [];
    const tinyFishBodies: z.infer<typeof tinyFishRequestSchema>[] = [];
    const fetchImpl: typeof fetch = (input, init) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url === "https://api.fetch.tinyfish.ai") {
        tinyFishBodies.push(
          tinyFishRequestSchema.parse(parseUnknownJson(String(init?.body)))
        );
        return Promise.resolve(
          Response.json({
            errors: [],
            results: [{ text: fatHtml }],
          })
        );
      }
      return Promise.resolve(new Response(thinHtml, { status: 200 }));
    };

    const html = await fetchWebsiteHtml("https://cafe.example", {
      browserRendering: { accountId: "acct", apiToken: "token" },
      fetchImpl,
      tinyFish: createTinyFishFetchBudget("tf_test"),
    });

    expect(html).toBe(fatHtml);
    expect(calls).toStrictEqual([
      "https://cafe.example",
      "https://api.fetch.tinyfish.ai",
    ]);
    expect(tinyFishBodies).toStrictEqual([
      { format: "html", urls: ["https://cafe.example"] },
    ]);
  });

  it("reuses one Fetch for the same URL and stops after the cap", async () => {
    let tinyFishCalls = 0;
    const fetchImpl: typeof fetch = (input) => {
      const url = requestUrl(input);
      if (url === "https://api.fetch.tinyfish.ai") {
        tinyFishCalls += 1;
        return Promise.resolve(
          Response.json({
            errors: [],
            results: [{ text: fatHtml }],
          })
        );
      }
      if (url.startsWith("https://api.cloudflare.com/")) {
        return Promise.reject(
          new Error("Browser Rendering should not run past the cap")
        );
      }
      return Promise.resolve(new Response(thinHtml, { status: 200 }));
    };

    const tinyFish = createTinyFishFetchBudget("tf_test");
    const options = {
      browserRendering: { accountId: "acct", apiToken: "token" },
      fetchImpl,
      tinyFish,
    };

    await fetchWebsiteHtml("https://cafe.example/home", options);
    await fetchWebsiteHtml("https://cafe.example/home", options);
    await fetchWebsiteHtml("https://cafe.example/contact", options);
    await fetchWebsiteHtml("https://cafe.example/menu", options);
    const capped = await fetchWebsiteHtml("https://cafe.example/blog", options);

    expect(tinyFishCalls).toBe(TINYFISH_RENDER_URL_CAP);
    expect(capped).toBe(thinHtml);
  });

  it("falls back to Browser Rendering when TinyFish Fetch fails", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url === "https://api.fetch.tinyfish.ai") {
        return Promise.resolve(
          Response.json({
            errors: [{ error: "bot_blocked", url: "https://cafe.example" }],
            results: [],
          })
        );
      }
      if (url.startsWith("https://api.cloudflare.com/")) {
        return Promise.resolve(
          Response.json({ result: fatHtml, success: true })
        );
      }
      return Promise.resolve(new Response(thinHtml, { status: 200 }));
    };

    const html = await fetchWebsiteHtml("https://cafe.example", {
      browserRendering: { accountId: "acct", apiToken: "token" },
      fetchImpl,
      tinyFish: createTinyFishFetchBudget("tf_test"),
    });

    expect(html).toBe(fatHtml);
    expect(
      calls.some((url) => url.startsWith("https://api.cloudflare.com/"))
    ).toBeTruthy();
  });

  it("uses Browser Rendering when TinyFish is unset", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url.startsWith("https://api.cloudflare.com/")) {
        return Promise.resolve(
          Response.json({ result: fatHtml, success: true })
        );
      }
      return Promise.resolve(new Response(thinHtml, { status: 200 }));
    };

    const html = await fetchWebsiteHtml("https://cafe.example", {
      browserRendering: { accountId: "acct", apiToken: "token" },
      fetchImpl,
    });

    expect(html).toBe(fatHtml);
    expect(
      calls.some((url) => url === "https://api.fetch.tinyfish.ai")
    ).toBeFalsy();
  });
});
