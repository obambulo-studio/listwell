import { describe, expect, it } from "vitest";

import { saveSearchPhraseDraft, templateSearchPhrases } from "./search-phrases";
import { suggestSearchPhrases } from "./suggest-search-phrases";

describe(templateSearchPhrases, () => {
  it("suggests phrases from the category label and suburb", () => {
    expect(templateSearchPhrases("Cafe", "Newtown")).toStrictEqual([
      "cafe Newtown",
      "cafe near me",
    ]);
  });

  it("adds a shorter near-me phrase when the label has more than one word", () => {
    expect(templateSearchPhrases("Coffee shop", "Fitzroy")).toStrictEqual([
      "coffee shop Fitzroy",
      "coffee shop near me",
      "coffee near me",
    ]);
  });
});

describe(saveSearchPhraseDraft, () => {
  it("gives an edited phrase a new id and keeps the unchanged phrase", () => {
    const current = saveSearchPhraseDraft(
      [],
      [
        { suggested: true, text: "cafe Newtown" },
        { suggested: true, text: "cafe near me" },
      ]
    );
    const edited = saveSearchPhraseDraft(current, [
      { suggested: false, text: "coffee Newtown" },
      { suggested: true, text: "cafe near me" },
    ]);
    expect(edited[0]?.id).not.toBe(current[0]?.id);
    expect(edited[1]?.id).toBe(current[1]?.id);
    expect(edited[0]?.text).toBe("coffee Newtown");
    expect(current[0]?.id).toBeTruthy();
  });
});

describe(suggestSearchPhrases, () => {
  it("uses the template when Jev is not configured", async () => {
    const phrases = await suggestSearchPhrases({
      categoryLabel: "Cafe",
      config: null,
      suburb: "Newtown",
    });
    expect(phrases.map((phrase) => phrase.text)).toStrictEqual([
      "cafe Newtown",
      "cafe near me",
    ]);
    expect(phrases.every((phrase) => phrase.suggested)).toBeTruthy();
  });
});
