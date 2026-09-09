import { describe, expect, it, vi } from "vitest";

import {
  WORKERS_AI_MODEL,
  buildFallbackSummary,
  buildListwellPrompt,
  extractModelText,
  filterToCitedChecks,
  introducesInventedScore,
  parseJsonObject,
  resolveWorkersAiBinding,
  summarizeAuditChecks,
} from "./summaries";
import type { WorkersAiBinding } from "./summaries";

const checks = [
  {
    channelCategory: "Website",
    id: "website-title",
    label: 'Title missing location: "Smith & Sons"',
    points: 6,
    status: "fail" as const,
    title: "Title contains business name and suburb/city",
  },
  {
    channelCategory: "Website",
    id: "website-200-299",
    points: 8,
    status: "pass" as const,
    title: "Website returns a successful status",
  },
  {
    channelCategory: "Google Business Profile",
    id: "google-listing-photos",
    points: 4,
    status: "fail" as const,
    title: "Google listing has photos",
  },
];

describe(resolveWorkersAiBinding, () => {
  it("returns the first candidate with a run function", () => {
    const ai: WorkersAiBinding = { run: vi.fn<WorkersAiBinding["run"]>() };
    expect(resolveWorkersAiBinding(undefined, null, {}, ai)).toBe(ai);
  });

  it("returns null when the AI binding is missing", () => {
    expect(
      resolveWorkersAiBinding(undefined, null, { notAi: true })
    ).toBeNull();
  });
});

describe("extractModelText and parseJsonObject", () => {
  it("reads Workers AI response shapes", () => {
    expect(extractModelText({ response: '{"ok":true}' })).toBe('{"ok":true}');
    expect(extractModelText({ result: { response: '{"ok":true}' } })).toBe(
      '{"ok":true}'
    );
  });

  it("strips markdown fences", () => {
    expect(parseJsonObject('```json\n{"overview":[]}\n```')).toStrictEqual({
      overview: [],
    });
  });
});

describe("citation and score guards", () => {
  it("drops claims that cite unknown checks", () => {
    const filtered = filterToCitedChecks(
      {
        nextActions: [
          {
            checkIds: ["google-listing-photos"],
            priority: 1,
            text: "Add photos.",
          },
        ],
        overview: [
          { checkIds: ["not-a-check"], text: "Invented finding." },
          { checkIds: ["website-title"], text: "Title is missing the suburb." },
        ],
      },
      checks
    );

    expect(filtered?.overview).toStrictEqual([
      { checkIds: ["website-title"], text: "Title is missing the suburb." },
    ]);
    expect(filtered?.nextActions[0]?.checkIds).toStrictEqual([
      "google-listing-photos",
    ]);
  });

  it("rejects invented percentages and scores", () => {
    expect(
      introducesInventedScore("Visibility score is 12%.", checks)
    ).toBeTruthy();
    expect(
      introducesInventedScore('Title missing location: "Smith & Sons"', checks)
    ).toBeFalsy();
    expect(
      introducesInventedScore("Highest listed weight is 6 points.", checks)
    ).toBeFalsy();
  });

  it("returns null when every claim lacks a valid citation", () => {
    expect(
      filterToCitedChecks(
        {
          nextActions: [],
          overview: [{ checkIds: ["missing"], text: "All good." }],
        },
        checks
      )
    ).toBeNull();
  });
});

describe(buildFallbackSummary, () => {
  it("prioritises failed checks by provided points and cites them", () => {
    const summary = buildFallbackSummary(checks, "ai_binding_missing");

    expect({
      available: summary.available,
      degradedReason: summary.degradedReason,
      nextActionIds: summary.nextActions.map((action) => action.checkIds[0]),
      overviewCheckIds: summary.overview[0]?.checkIds,
      overviewText: summary.overview[0]?.text,
      source: summary.source,
      visimateFree: JSON.stringify(summary).match(/visimate/iu) === null,
    }).toStrictEqual({
      available: false,
      degradedReason: "ai_binding_missing",
      nextActionIds: ["website-title", "google-listing-photos"],
      overviewCheckIds: ["website-title", "google-listing-photos"],
      overviewText:
        "2 checks did not pass. The highest-weight miss is Title contains business name and suburb/city.",
      source: "fallback",
      visimateFree: true,
    });
    expect(summary.overview[0]?.text).not.toMatch(/points/iu);
  });

  it("does not invent an overall score when checks are empty", () => {
    const summary = buildFallbackSummary([], "no_completed_checks");
    expect(summary.overview).toStrictEqual([]);
    expect(summary.nextActions).toStrictEqual([]);
    expect(summary.degradedReason).toBe("no_completed_checks");
  });
});

describe(summarizeAuditChecks, () => {
  it("degrades when the AI binding is missing", async () => {
    const summary = await summarizeAuditChecks({
      ai: null,
      businessName: "Smith & Sons",
      checks,
    });

    expect(summary.degradedReason).toBe("ai_binding_missing");
    expect(summary.source).toBe("fallback");
  });

  it("keeps a cited Workers AI brief and drops invented scores", async () => {
    const ai: WorkersAiBinding = {
      run: vi.fn<WorkersAiBinding["run"]>().mockResolvedValue({
        response: JSON.stringify({
          nextActions: [
            {
              checkIds: ["website-title"],
              priority: 1,
              text: "Add the suburb to the title.",
            },
          ],
          overview: [
            {
              checkIds: ["website-title"],
              text: "The title is missing the suburb.",
            },
            { checkIds: ["website-title"], text: "Overall score is 41%." },
          ],
        }),
      }),
    };

    const summary = await summarizeAuditChecks({
      ai,
      businessName: "Smith & Sons",
      checks,
    });

    expect(ai.run).toHaveBeenCalledWith(WORKERS_AI_MODEL, expect.any(Object));
    expect(summary.available).toBeTruthy();
    expect(summary.source).toBe("workers-ai");
    expect(summary.overview.map((claim) => claim.text)).toStrictEqual([
      "The title is missing the suburb.",
    ]);
    expect(summary.nextActions[0]?.checkIds).toStrictEqual(["website-title"]);
  });

  it("falls back when the model invents every claim", async () => {
    const summary = await summarizeAuditChecks({
      ai: {
        run: vi.fn<WorkersAiBinding["run"]>().mockResolvedValue({
          response: JSON.stringify({
            nextActions: [],
            overview: [{ checkIds: ["nope"], text: "Score is 99%." }],
          }),
        }),
      },
      businessName: "Smith & Sons",
      checks,
    });

    expect(summary.source).toBe("fallback");
    expect(summary.degradedReason).toBe("model_output_invalid");
  });

  it("falls back when the model request fails", async () => {
    const summary = await summarizeAuditChecks({
      ai: {
        run: vi
          .fn<WorkersAiBinding["run"]>()
          .mockRejectedValue(new Error("binding unavailable")),
      },
      businessName: "Smith & Sons",
      checks,
    });

    expect(summary.degradedReason).toBe("model_request_failed");
  });
});

describe("Listwell copy", () => {
  it("names Listwell and never Visimate in the model prompt", () => {
    const prompt = buildListwellPrompt("Smith & Sons", checks);
    expect(prompt).toContain("Listwell");
    expect(prompt).toMatch(/Do not mention Visimate/u);
    expect(prompt).not.toMatch(/You are Visimate/iu);
  });
});
