import { RequestCookiesAdapter } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import type { cookies, headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authRequestHeaders } from "./auth-request-headers";

const { headersMock, cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn<typeof cookies>(),
  headersMock: vi.fn<typeof headers>(),
}));

type CookieJar = Awaited<ReturnType<typeof cookies>>;

const createCookieJar = (
  entries: { name: string; value: string }[]
): CookieJar => {
  const requestHeaders = new Headers();
  if (entries.length > 0) {
    requestHeaders.set(
      "cookie",
      entries.map(({ name, value }) => `${name}=${value}`).join("; ")
    );
  }
  return RequestCookiesAdapter.seal(new RequestCookies(requestHeaders));
};

vi.mock(import("next/headers"), () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

describe(authRequestHeaders, () => {
  beforeEach(() => {
    headersMock.mockReset();
    cookiesMock.mockReset();
    process.env.NEXT_PUBLIC_SITE_URL = "https://listwell.dev";
  });

  it("merges cookies when the raw Cookie header is missing", async () => {
    headersMock.mockResolvedValue(new Headers());
    cookiesMock.mockResolvedValue(
      createCookieJar([{ name: "better-auth.session_token", value: "abc" }])
    );

    const merged = await authRequestHeaders();

    expect(merged.get("cookie")).toBe("better-auth.session_token=abc");
    expect(merged.get("x-better-auth-forwarded-host")).toBe("listwell.dev");
    expect(merged.get("x-better-auth-forwarded-proto")).toBe("https");
  });

  it("keeps an existing Cookie header", async () => {
    headersMock.mockResolvedValue(
      new Headers({ cookie: "better-auth.session_token=xyz" })
    );
    cookiesMock.mockResolvedValue(createCookieJar([]));

    const merged = await authRequestHeaders();

    expect(merged.get("cookie")).toBe("better-auth.session_token=xyz");
  });

  it("merges auth cookies from the jar when the Cookie header is incomplete", async () => {
    headersMock.mockResolvedValue(
      new Headers({ cookie: "__cf_bm=cloudflare-only" })
    );
    cookiesMock.mockResolvedValue(
      createCookieJar([{ name: "better-auth.session_token", value: "abc" }])
    );

    const merged = await authRequestHeaders();

    expect(merged.get("cookie")).toBe(
      "__cf_bm=cloudflare-only; better-auth.session_token=abc"
    );
  });

  it("prefers jar values over duplicate names in the Cookie header", async () => {
    headersMock.mockResolvedValue(
      new Headers({ cookie: "better-auth.session_token=stale" })
    );
    cookiesMock.mockResolvedValue(
      createCookieJar([{ name: "better-auth.session_token", value: "fresh" }])
    );

    const merged = await authRequestHeaders();

    expect(merged.get("cookie")).toBe("better-auth.session_token=fresh");
  });
});
