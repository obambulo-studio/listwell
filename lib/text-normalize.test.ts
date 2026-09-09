import { describe, expect, it } from "vitest";

import {
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
  it("title-cases business names with small-word exceptions", () => {
    expect(normalizeBusinessName("haddon institute")).toBe("Haddon Institute");
    expect(normalizeBusinessName("smith and sons")).toBe("Smith and Sons");
    expect(normalizeBusinessName("the corner store")).toBe("The Corner Store");
  });

  it("handles apostrophes in names", () => {
    expect(normalizeBusinessName("mcdonald's cafe")).toBe("McDonald's Cafe");
  });

  it("handles hyphenated names", () => {
    expect(normalizeBusinessName("north-side bakery")).toBe(
      "North-Side Bakery"
    );
  });
});

describe(normalizeCategoryText, () => {
  it("uses business-name rules for free-text categories", () => {
    expect(normalizeCategoryText("pet grooming")).toBe("Pet Grooming");
  });
});

describe(normalizeWebsiteInput, () => {
  it("leaves URLs unchanged", () => {
    expect(normalizeWebsiteInput("https://example.com/path")).toBe(
      "https://example.com/path"
    );
    expect(normalizeWebsiteInput("HTTP://EXAMPLE.COM")).toBe(
      "HTTP://EXAMPLE.COM"
    );
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
  it("normalises business name phase input", () => {
    expect(
      normalizeChatInput("business_name", "haddon institute")
    ).toStrictEqual({
      kind: "text",
      value: "Haddon Institute",
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

  it("leaves website URLs unchanged", () => {
    expect(
      normalizeChatInput("website", "https://haddon.institute")
    ).toStrictEqual({
      kind: "text",
      value: "https://haddon.institute",
    });
  });
});
