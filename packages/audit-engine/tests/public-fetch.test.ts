import { describe, expect, it } from "vitest";

import {
  createTinyFishFetchBudget,
  fetchBrowserRenderingHtml,
  fetchText,
  fetchTinyFishHtml,
  fetchWebsiteHtml,
} from "../src/browser";
import {
  assertPublicHttpUrl,
  fetchPublic,
  isPinnedSitemapUrl,
  UnsafeAuditUrlError,
} from "../src/public-fetch";

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
};

describe(assertPublicHttpUrl, () => {
  it("allows public http and https hosts", () => {
    expect(assertPublicHttpUrl("https://cafe.example/menu").hostname).toBe(
      "cafe.example"
    );
    expect(assertPublicHttpUrl("http://8.8.8.8/").hostname).toBe("8.8.8.8");
    expect(
      assertPublicHttpUrl("https://[2001:4860:4860::8888]/").hostname
    ).toBe("[2001:4860:4860::8888]");
    expect(assertPublicHttpUrl("http://[::ffff:808:808]/").hostname).toBe(
      "[::ffff:808:808]"
    );
  });

  it("rejects loopback, private, link-local, metadata, and non-http targets", () => {
    const blocked = [
      "http://localhost/",
      "http://localhost./",
      "http://127.0.0.1/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://0177.0.0.1/",
      "http://0/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://192.168.1.20/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://[::1]/",
      "http://[::ffff:7f00:1]/",
      "http://[fd00:ec2::254]/",
      "http://[fe80::1]/",
      "http://[fc00::1]/",
      "http://metadata.google.internal/",
      "http://printer.local/",
      "file:///etc/passwd",
      "ftp://cafe.example/",
      "https://user:pass@cafe.example/",
      "http://example.com@127.0.0.1/",
    ];
    for (const url of blocked) {
      expect(() => assertPublicHttpUrl(url)).toThrow(UnsafeAuditUrlError);
    }
  });
});

describe(isPinnedSitemapUrl, () => {
  it("allows the audited host and its www form", () => {
    expect(
      isPinnedSitemapUrl(
        "https://www.cafe.example/sitemap.xml",
        "https://cafe.example/"
      )
    ).toBeTruthy();
    expect(
      isPinnedSitemapUrl(
        "https://cafe.example/sitemap.xml",
        "https://www.cafe.example/"
      )
    ).toBeTruthy();
  });

  it("rejects another host", () => {
    expect(
      isPinnedSitemapUrl(
        "https://evil.example/sitemap.xml",
        "https://cafe.example/"
      )
    ).toBeFalsy();
    expect(
      isPinnedSitemapUrl(
        "http://127.0.0.1/sitemap.xml",
        "https://cafe.example/"
      )
    ).toBeFalsy();
  });
});

const oversizedFetch: typeof fetch = () =>
  Promise.resolve(new Response("x".repeat(50), { status: 200 }));

const waitForAbort = (
  signal: AbortSignal | null | undefined
): Promise<Response> => {
  if (!signal) {
    return Promise.reject(new Error("missing abort signal"));
  }
  // The time cap is the abort itself. There is no earlier promise to return.
  // eslint-disable-next-line promise/avoid-new
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      reject(signal.reason);
    });
  });
};

const hangingFetch: typeof fetch = (_input, init) => waitForAbort(init?.signal);

const brotliFetch =
  (contentEncoding: string): typeof fetch =>
  () =>
    Promise.resolve(
      new Response("not-html", {
        headers: { "content-encoding": contentEncoding },
        status: 200,
      })
    );

const alreadyDecodedFetch: typeof fetch = () =>
  Promise.resolve(
    new Response("menu", {
      headers: { "content-encoding": "gzip" },
      status: 200,
    })
  );

describe(fetchPublic, () => {
  it("follows a public redirect and checks the next hop", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url === "https://cafe.example/start") {
        return Promise.resolve(
          new Response(null, {
            headers: { location: "https://www.cafe.example/menu" },
            status: 302,
          })
        );
      }
      return Promise.resolve(new Response("menu", { status: 200 }));
    };
    const fetched = await fetchPublic(
      "https://cafe.example/start",
      {},
      fetchImpl
    );
    expect(calls).toStrictEqual([
      "https://cafe.example/start",
      "https://www.cafe.example/menu",
    ]);
    expect(fetched.url).toBe("https://www.cafe.example/menu");
    await expect(fetched.response.text()).resolves.toBe("menu");
  });

  it("does not request a redirect target that is a private address", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(requestUrl(input));
      return Promise.resolve(
        new Response(null, {
          headers: { location: "http://169.254.169.254/" },
          status: 302,
        })
      );
    };
    await expect(
      fetchPublic("https://cafe.example/", {}, fetchImpl)
    ).rejects.toThrow(UnsafeAuditUrlError);
    expect(calls).toStrictEqual(["https://cafe.example/"]);
  });

  it("stops after the redirect hop limit", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = () => {
      calls += 1;
      return Promise.resolve(
        new Response(null, {
          headers: { location: "https://cafe.example/again" },
          status: 302,
        })
      );
    };
    await expect(
      fetchPublic("https://cafe.example/start", { maxRedirects: 1 }, fetchImpl)
    ).rejects.toThrow(/redirect/iu);
    expect(calls).toBe(2);
  });

  it("rejects a body over the byte cap", async () => {
    await expect(
      fetchPublic("https://cafe.example/", { maxBytes: 10 }, oversizedFetch)
    ).rejects.toThrow(/size cap/iu);
  });

  it("aborts when the time cap is reached", async () => {
    await expect(
      fetchPublic("https://cafe.example/", { timeoutMs: 20 }, hangingFetch)
    ).rejects.toThrow(/abort|timeout/iu);
  });

  it("asks for gzip or deflate and does not advertise brotli", async () => {
    let acceptEncoding = "";
    let userAgent = "";
    let decompressDisabled = false;
    const fetchImpl: typeof fetch = (_input, init) => {
      const headers = new Headers(init?.headers);
      acceptEncoding = headers.get("accept-encoding") ?? "";
      userAgent = headers.get("user-agent") ?? "";
      decompressDisabled =
        init !== undefined && "decompress" in init && init.decompress === false;
      return Promise.resolve(new Response("menu", { status: 200 }));
    };
    const fetched = await fetchPublic(
      "https://cafe.example/",
      {
        headers: { "accept-encoding": "br", "user-agent": "ListwellAuditBot" },
      },
      fetchImpl
    );
    expect(acceptEncoding).toBe("gzip, deflate");
    expect(userAgent).toBe("ListwellAuditBot");
    expect(decompressDisabled).toBeTruthy();
    await expect(fetched.response.text()).resolves.toBe("menu");
  });

  it("rejects a Brotli body without decoding it", async () => {
    await expect(
      fetchPublic("https://cafe.example/", {}, brotliFetch("br"))
    ).rejects.toThrow("Refusing a Brotli-encoded response");
    await expect(
      fetchPublic("https://cafe.example/", {}, brotliFetch("BR"))
    ).rejects.toThrow("Refusing a Brotli-encoded response");
    await expect(
      fetchPublic("https://cafe.example/", {}, brotliFetch("gzip, br"))
    ).rejects.toThrow("Refusing a Brotli-encoded response");
  });

  it("inflates a gzip body and keeps an already decoded one", async () => {
    const gzip = new CompressionStream("gzip");
    const compressed = new Uint8Array(
      await new Response(
        new Blob(["menu"]).stream().pipeThrough(gzip)
      ).arrayBuffer()
    );
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(compressed, {
          headers: { "content-encoding": "gzip" },
          status: 200,
        })
      );
    const fetched = await fetchPublic("https://cafe.example/", {}, fetchImpl);
    await expect(fetched.response.text()).resolves.toBe("menu");
    expect(fetched.response.headers.get("content-encoding")).toBeNull();

    const plain = await fetchPublic(
      "https://cafe.example/",
      {},
      alreadyDecodedFetch
    );
    await expect(plain.response.text()).resolves.toBe("menu");
  });
});

describe("rendered fetches", () => {
  it("does not decode a Brotli page or pass it to TinyFish", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(requestUrl(input));
      return Promise.resolve(
        new Response("not-html", {
          headers: { "content-encoding": "br" },
          status: 200,
        })
      );
    };
    await expect(
      fetchWebsiteHtml("https://cafe.example/", {
        fetchImpl,
        tinyFish: createTinyFishFetchBudget("tf_test"),
      })
    ).rejects.toThrow("Refusing a Brotli-encoded response");
    await expect(
      fetchText("https://cafe.example/robots.txt", fetchImpl)
    ).resolves.toStrictEqual({ body: "", ok: false, status: 0 });
    expect(calls).toStrictEqual([
      "https://cafe.example/",
      "https://cafe.example/robots.txt",
    ]);
  });

  it("does not call TinyFish or Browser Rendering for a private URL", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = (input) => {
      calls.push(requestUrl(input));
      return Promise.resolve(new Response("<html></html>", { status: 200 }));
    };
    await expect(
      fetchWebsiteHtml("http://127.0.0.1/", {
        fetchImpl,
        preferBrowser: true,
        tinyFish: createTinyFishFetchBudget("tf_test"),
      })
    ).rejects.toThrow(UnsafeAuditUrlError);
    await expect(
      fetchTinyFishHtml("http://169.254.169.254/", "tf_test", fetchImpl)
    ).rejects.toThrow(UnsafeAuditUrlError);
    await expect(
      fetchBrowserRenderingHtml(
        "http://[::1]/",
        { accountId: "account", apiToken: "token" },
        fetchImpl
      )
    ).rejects.toThrow(UnsafeAuditUrlError);
    expect(calls).toStrictEqual([]);
  });
});
