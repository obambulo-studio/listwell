import { describe, expect, it } from "vitest";

import {
  fixEffortFromBody,
  fixInstructionsFromBody,
  fixStepsClipboardText,
  mdcToMarkdown,
} from "./markdown";

describe(fixInstructionsFromBody, () => {
  it("breaks fix-step blocks into titled instructions", () => {
    const markdown = mdcToMarkdown(`
## How can I fix it?

::fix-step{number="1" title="Visit Google Business Profile"} Go to business.google.com and click Manage now. ::

::fix-step{number="2" title="Claim or create your listing"}

- If your business appears: click Claim this business
- If not found: click Add your business ::

::time-estimate{minutes="30" difficulty="easy"}::

## What is the positive impact?

You show up in local search.
`);

    const instructions = fixInstructionsFromBody(markdown);

    expect(instructions?.steps).toStrictEqual([
      {
        body: "Go to business.google.com and click Manage now.",
        title: "Visit Google Business Profile",
      },
      {
        body: "- If your business appears: click Claim this business\n- If not found: click Add your business",
        title: "Claim or create your listing",
      },
    ]);
    expect(instructions?.intro).toBeNull();
    expect(instructions?.estimate).toBe("About 30 minutes. Easy.");
  });

  it("keeps a single paragraph as the instruction", () => {
    const instructions = fixInstructionsFromBody(`
## How can I fix it?

Respond to reviews, resolve recurring complaints, and ask satisfied customers to share feedback.

*About 480 minutes. Difficulty: medium.*
`);

    expect(instructions).toStrictEqual({
      estimate: "About 480 minutes. Medium.",
      intro:
        "Respond to reviews, resolve recurring complaints, and ask satisfied customers to share feedback.",
      steps: [],
    });
  });

  it("reads minutes and difficulty from a fix estimate", () => {
    expect(
      fixEffortFromBody("*About 30 minutes. Difficulty: easy.*")
    ).toStrictEqual({ difficulty: "easy", minutes: 30 });
    expect(fixEffortFromBody("No estimate here.")).toBeNull();
  });

  it("returns null when the check has no fix section", () => {
    expect(
      fixInstructionsFromBody(
        "## What we're checking\n\nWe look for a listing."
      )
    ).toBeNull();
  });
});

describe(fixStepsClipboardText, () => {
  it("copies numbered steps as plain text and leaves out the effort line", () => {
    const markdown = mdcToMarkdown(`
## How can I fix it?

::fix-step{number="1" title="Visit Google Business Profile"} Go to business.google.com and click Manage now. ::

::fix-step{number="2" title="Claim or create your listing"}

- If your business appears: click Claim this business
- If not found: click Add your business ::

::time-estimate{minutes="30" difficulty="easy"}::
`);

    expect(fixStepsClipboardText(markdown)).toBe(
      [
        "1. Visit Google Business Profile",
        "Go to business.google.com and click Manage now.",
        "",
        "2. Claim or create your listing",
        "- If your business appears: click Claim this business",
        "- If not found: click Add your business",
      ].join("\n")
    );
  });

  it("copies a paragraph instruction when there are no titled steps", () => {
    expect(
      fixStepsClipboardText(`
## How can I fix it?

Respond to reviews, resolve recurring complaints, and ask satisfied customers to share feedback.

*About 480 minutes. Difficulty: medium.*
`)
    ).toBe(
      "Respond to reviews, resolve recurring complaints, and ask satisfied customers to share feedback."
    );
  });

  it("returns null when the check has no fix section", () => {
    expect(
      fixStepsClipboardText("## What we're checking\n\nWe look for a listing.")
    ).toBeNull();
  });
});
