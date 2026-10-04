import { describe, expect, it } from "vitest";

import {
  coerceStoredWebsiteUrl,
  isSameBusinessName,
  isSkipCommand,
  normalizeBusinessName,
  normalizeCategoryText,
  normalizeChatInput,
  normalizeLocation,
  normalizeWebsiteInput,
} from "./text-normalize";

describe(normalizeLocation, () => {
  it("title-cases suburb names", () => {
    expect(normalizeLocation("logan")).toBe("Logan");
    expect(normalizeLocation("south brisbane")).toBe("South Brisbane");
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeLocation("  south   brisbane  ")).toBe("South Brisbane");
  });
});

describe(normalizeBusinessName, () => {
  it("keeps the casing the user typed", () => {
    expect(normalizeBusinessName("eBay")).toBe("eBay");
    expect(normalizeBusinessName("iFixit")).toBe("iFixit");
    expect(normalizeBusinessName("mcdonald's")).toBe("mcdonald's");
    expect(normalizeBusinessName("haddon institute")).toBe("haddon institute");
  });

  it("trims and collapses whitespace", () => {
    expect(normalizeBusinessName("  blackstar   coffee  ")).toBe(
      "blackstar coffee"
    );
  });

  it("preserves deliberate case changes", () => {
    expect(normalizeBusinessName("Obambulo Studio")).toBe("Obambulo Studio");
    expect(normalizeBusinessName("obambulo studio")).toBe("obambulo studio");
  });
});

describe(isSameBusinessName, () => {
  it("treats case-only edits as a change", () => {
    expect(
      isSameBusinessName("Obambulo Studio", "obambulo studio")
    ).toBeFalsy();
  });

  it("ignores extra whitespace", () => {
    expect(
      isSameBusinessName("Obambulo Studio", "  Obambulo   Studio ")
    ).toBeTruthy();
  });
});

describe(normalizeCategoryText, () => {
  it("title-cases free-text categories", () => {
    expect(normalizeCategoryText("pet grooming")).toBe("Pet Grooming");
  });
});

describe(normalizeWebsiteInput, () => {
  it("leaves URLs with a scheme unchanged", () => {
    expect(normalizeWebsiteInput("https://example.com/path")).toBe(
      "https://example.com/path"
    );
    expect(normalizeWebsiteInput("HTTP://EXAMPLE.COM")).toBe(
      "HTTP://EXAMPLE.COM"
    );
  });

  it("prefixes bare hosts with https", () => {
    expect(normalizeWebsiteInput("assetal.store")).toBe(
      "https://assetal.store"
    );
    expect(normalizeWebsiteInput("  example.com.au/menu  ")).toBe(
      "https://example.com.au/menu"
    );
  });
});

describe(coerceStoredWebsiteUrl, () => {
  it("normalises bare hosts for use in fetches", () => {
    expect(coerceStoredWebsiteUrl("assetal.store")).toBe(
      "https://assetal.store/"
    );
  });

  it("returns null for empty or invalid values", () => {
    expect(coerceStoredWebsiteUrl(null)).toBeNull();
    expect(coerceStoredWebsiteUrl("")).toBeNull();
    expect(coerceStoredWebsiteUrl("not a url")).toBeNull();
  });
});

describe(isSkipCommand, () => {
  it("recognises skip in any casing", () => {
    expect(isSkipCommand("skip")).toBeTruthy();
    expect(isSkipCommand("Skip")).toBeTruthy();
    expect(isSkipCommand(" SKIP ")).toBeTruthy();
  });

  it("does not treat other text as skip", () => {
    expect(isSkipCommand("skipped")).toBeFalsy();
    expect(isSkipCommand("https://example.com")).toBeFalsy();
  });
});

describe(normalizeChatInput, () => {
  it("keeps business name casing", () => {
    expect(normalizeChatInput("business_name", "  eBay  ")).toStrictEqual({
      kind: "text",
      value: "eBay",
    });
  });

  it("normalises location phase input", () => {
    expect(normalizeChatInput("location", "logan")).toStrictEqual({
      kind: "text",
      value: "Logan",
    });
  });

  it("returns skip for website phase", () => {
    expect(normalizeChatInput("website", "skip")).toStrictEqual({
      display: "Skip",
      kind: "skip",
    });
    expect(normalizeChatInput("website", "SKIP")).toStrictEqual({
      display: "Skip",
      kind: "skip",
    });
  });

  it("normalises bare website hosts", () => {
    expect(normalizeChatInput("website", "assetal.store")).toStrictEqual({
      kind: "text",
      value: "https://assetal.store",
    });
    expect(
      normalizeChatInput("website", "https://haddon.institute")
    ).toStrictEqual({
      kind: "text",
      value: "https://haddon.institute",
    });
  });
});
