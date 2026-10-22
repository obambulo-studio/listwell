import { describe, expect, it } from "vitest";

import {
  REPORT_MONTHLY_PRICE,
  REPORT_ONCE_PRICE,
  REPORT_YEARLY_PRICE,
} from "./polar";
import {
  audAmount,
  homeStructuredData,
  jsonLdScriptContent,
} from "./structured-data";

const origin = "https://listwell.dev";

const graphNode = (type: string) => {
  const node = homeStructuredData(origin)["@graph"].find(
    (entry) => entry["@type"] === type
  );
  if (!node) {
    throw new Error(`Missing ${type}`);
  }
  return node;
};

describe(audAmount, () => {
  it("reads amounts from the display prices", () => {
    expect(audAmount("A$9.99")).toBe("9.99");
    expect(audAmount("A$4.99/mo per business")).toBe("4.99");
    expect(audAmount("A$49/yr")).toBe("49.00");
  });

  it("throws when there is no AUD amount", () => {
    expect(() => audAmount("free")).toThrow("No AUD amount");
  });
});

describe(homeStructuredData, () => {
  it("includes Organization, WebSite and SoftwareApplication", () => {
    const types = homeStructuredData(origin)["@graph"].map(
      (entry) => entry["@type"]
    );
    expect(types).toStrictEqual([
      "Organization",
      "WebSite",
      "SoftwareApplication",
    ]);
  });

  it("brands every node as Listwell on the given origin", () => {
    for (const node of homeStructuredData(origin)["@graph"]) {
      expect(node.name).toBe("Listwell");
      expect(node.url).toBe(`${origin}/`);
    }
  });

  it("prices the offers in AUD from the existing pricing source", () => {
    const offers = graphNode("SoftwareApplication").offers ?? [];
    expect(
      offers.map((offer) => [offer.price, offer.priceCurrency])
    ).toStrictEqual([
      [audAmount(REPORT_ONCE_PRICE), "AUD"],
      [audAmount(REPORT_MONTHLY_PRICE), "AUD"],
      [audAmount(REPORT_YEARLY_PRICE), "AUD"],
    ]);
    expect(offers.map((offer) => offer.price)).toStrictEqual([
      "9.99",
      "4.99",
      "49.00",
    ]);
  });

  it("has no sameAs links", () => {
    expect(JSON.stringify(homeStructuredData(origin))).not.toContain("sameAs");
  });
});

describe(jsonLdScriptContent, () => {
  it("escapes < so the script tag cannot be closed early", () => {
    const content = jsonLdScriptContent({ name: "</script><b>" });
    expect(content).not.toContain("<");
    expect(JSON.parse(content)).toStrictEqual({ name: "</script><b>" });
  });
});
