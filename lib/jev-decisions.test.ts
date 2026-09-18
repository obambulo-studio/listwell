import { describe, expect, it } from "vitest";

import type { PlaceCandidate } from "./discover";
import {
  findListingCandidateByOption,
  jevRefineListingCandidates,
  listingOptionLabel,
} from "./jev-decisions";
import type { TypeSafeConfig } from "./typesafe";

const testConfig: TypeSafeConfig = {
  apiKey: "test-key",
  model: "jev-latest",
};

const mockListingMatchResponse = () =>
  Response.json({
    answers: {
      listing_match: {
        choice: "google-joes-newtown",
        confidence: 0.9,
        type: "choice",
      },
      none_of_these: { noul: 0.1, type: "noul" },
      same_place: { confidence: 0.85, score: 1.9, type: "score" },
    },
  });

const mockListingNoneResponse = () =>
  Response.json({
    answers: {
      listing_match: {
        choice: "none",
        confidence: 0.88,
        type: "choice",
      },
      none_of_these: { noul: 0.92, type: "noul" },
      same_place: { confidence: 0.7, score: 0.4, type: "score" },
    },
  });

const joesNewtown: PlaceCandidate = {
  address: "1 Main St, Newtown NSW",
  id: "google-joes-newtown",
  name: "Joe's Pizza",
  source: "google",
  suburb: "Newtown",
};

const joesSurry: PlaceCandidate = {
  address: "2 King St, Surry Hills NSW",
  id: "google-joes-surry",
  name: "Joe's Pizza",
  source: "google",
  suburb: "Surry Hills",
};

describe("listing labels and lookup", () => {
  it("builds unique listing option labels for duplicate names", () => {
    expect(listingOptionLabel(joesNewtown)).toBe("Joe's Pizza (Newtown)");
    expect(listingOptionLabel(joesSurry)).toBe("Joe's Pizza (Surry Hills)");
  });

  it("resolves listing pick by option label not name alone", () => {
    const candidates = [joesNewtown, joesSurry];
    expect(
      findListingCandidateByOption(candidates, "Joe's Pizza (Newtown)")?.id
    ).toBe("google-joes-newtown");
    expect(
      findListingCandidateByOption(candidates, "Joe's Pizza (Surry Hills)")?.id
    ).toBe("google-joes-surry");
  });
});

describe(jevRefineListingCandidates, () => {
  it("sets strongMatchId when Jev returns a confident same-place pick", async () => {
    const fetchImpl = () => Promise.resolve(mockListingMatchResponse());

    const result = await jevRefineListingCandidates({
      businessName: "Joe's Pizza",
      candidates: [joesSurry, joesNewtown],
      config: testConfig,
      fetchImpl,
      near: "Newtown",
    });

    expect(result.strongMatchId).toBe("google-joes-newtown");
    expect(result.candidates[0]?.id).toBe("google-joes-newtown");
  });

  it("leaves candidates unchanged when Jev chooses none", async () => {
    const fetchImpl = () => Promise.resolve(mockListingNoneResponse());

    const input = [joesSurry, joesNewtown];
    const result = await jevRefineListingCandidates({
      businessName: "Joe's Pizza",
      candidates: input,
      config: testConfig,
      fetchImpl,
      near: "Newtown",
    });

    expect(result.strongMatchId).toBeUndefined();
    expect(result.candidates).toStrictEqual(input);
  });
});
