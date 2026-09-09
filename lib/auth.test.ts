import { describe, expect, it } from "vitest";

import {
  cookiesFromAuthResponse,
  copyAuthCookies,
  isAuthEnabled,
  maskEmail,
  normalizeEmail,
  timingSafeEqual,
} from "./auth";

describe(normalizeEmail, () => {
  it("trims and lowercases a valid address", () => {
    expect(normalizeEmail("  Ada@Example.com ")).toBe("ada@example.com");
  });

  it("rejects invalid addresses", () => {
    expect(normalizeEmail("not-an-email")).toBeUndefined();
    expect(normalizeEmail("")).toBeUndefined();
  });
});

describe(maskEmail, () => {
  it("keeps the first local character and the domain", () => {
    expect(maskEmail("jane@example.com")).toBe("j***@example.com");
  });
});

describe(timingSafeEqual, () => {
  it("matches equal strings and rejects different strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBeTruthy();
    expect(timingSafeEqual("abc", "abd")).toBeFalsy();
  });
});

describe(isAuthEnabled, () => {
  it("is true when Convex URLs are configured", async () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "http://127.0.0.1:3210";
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "http://127.0.0.1:3211";
    await expect(isAuthEnabled()).resolves.toBeTruthy();
  });
});

describe(cookiesFromAuthResponse, () => {
  it("reads Set-Cookie values from an auth response", () => {
    const response = new Response(null, {
      headers: {
        "Set-Cookie": "better-auth.session_token=abc; Path=/",
      },
    });
    expect(cookiesFromAuthResponse(response)).toContain(
      "better-auth.session_token=abc; Path=/"
    );
  });

  it("returns an empty list when auth did not set cookies", () => {
    expect(cookiesFromAuthResponse(new Response(null))).toStrictEqual([]);
  });
});

describe(copyAuthCookies, () => {
  it("copies each cookie onto the outgoing headers", () => {
    const headers = new Headers();
    copyAuthCookies(
      [
        "better-auth.session_token=abc; Path=/",
        "better-auth.session_data=xyz; Path=/",
      ],
      headers
    );
    expect(headers.getSetCookie()).toStrictEqual([
      "better-auth.session_token=abc; Path=/",
      "better-auth.session_data=xyz; Path=/",
    ]);
  });
});
