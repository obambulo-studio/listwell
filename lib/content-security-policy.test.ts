import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import {
  CONTENT_SECURITY_POLICY_HEADER,
  contentSecurityPolicy,
  contentSecurityPolicyFromEnv,
} from "./content-security-policy";

const productionPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://www.gravatar.com https://secure.gravatar.com https://i.gravatar.com https://s.gravatar.com https://fine-elephant-894.ap-southeast-2.convex.cloud https://fine-elephant-894.ap-southeast-2.convex.site",
  "font-src 'self' data:",
  "connect-src 'self' https://fine-elephant-894.ap-southeast-2.convex.cloud wss://fine-elephant-894.ap-southeast-2.convex.cloud https://fine-elephant-894.ap-southeast-2.convex.site wss://fine-elephant-894.ap-southeast-2.convex.site",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

describe(contentSecurityPolicy, () => {
  it("allows the Convex deployment, Gravatar, and inline app scripts", () => {
    expect(
      contentSecurityPolicy({
        convexSiteUrl: "https://fine-elephant-894.ap-southeast-2.convex.site",
        convexUrl: "https://fine-elephant-894.ap-southeast-2.convex.cloud",
        development: false,
      })
    ).toBe(productionPolicy);
  });

  it("allows eval only while developing and skips the https upgrade", () => {
    const policy = contentSecurityPolicy({
      convexSiteUrl: "http://127.0.0.1:3211",
      convexUrl: "http://127.0.0.1:3210",
      development: true,
    });
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).toContain("ws://127.0.0.1:3210");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});

describe("response headers", () => {
  it("sends a content security policy on every route", async () => {
    const { headers } = nextConfig;
    if (!headers) {
      throw new Error("next config headers are missing");
    }
    const rules = await headers();
    expect(rules.map((rule) => rule.source)).toContain("/(.*)");
    const policy = rules
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === CONTENT_SECURITY_POLICY_HEADER);
    expect(policy).toStrictEqual({
      key: CONTENT_SECURITY_POLICY_HEADER,
      value: contentSecurityPolicyFromEnv(),
    });
    expect(policy?.value.length).toBeGreaterThan(0);
  });
});
