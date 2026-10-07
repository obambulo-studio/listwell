import { describe, expect, it } from "vitest";

import {
  parsePlaceCandidateKey,
  placeCandidateKey,
} from "./listing-audit-workflow";

describe(placeCandidateKey, () => {
  it("encodes source and id", () => {
    expect(
      placeCandidateKey({
        id: "ChIJ",
        name: "Cafe",
        source: "google",
      })
    ).toBe("google:ChIJ");
  });
});

describe(parsePlaceCandidateKey, () => {
  it("parses encoded keys", () => {
    expect(parsePlaceCandidateKey("apple:abc")).toStrictEqual({
      id: "abc",
      source: "apple",
    });
  });

  it("rejects invalid keys", () => {
    expect(parsePlaceCandidateKey("nope")).toBeNull();
  });
});
