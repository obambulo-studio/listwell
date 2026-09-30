import { describe, expect, it } from "vitest";

import { checkDefinitionSchema } from "./checks/types";
import {
  formatFixDuration,
  planNextActions,
  severityFromPoints,
} from "./fix-plan";
import type { NextAction } from "./summaries";

const definition = (id: string, body: string, points: number) =>
  checkDefinitionSchema.parse({
    body,
    businessCategories: null,
    channelCategory: "Website",
    id,
    points: { food: points, other: points, retail: points, services: points },
    title: id,
  });

const estimate = (minutes: number, difficulty: string): string =>
  `## How can I fix it?\n\nDo the work.\n\n*About ${minutes} minutes. Difficulty: ${difficulty}.*\n`;

const action = (
  id: string,
  priority: number,
  text = `Fix ${id}.`
): NextAction => ({
  checkIds: [id],
  priority,
  text,
});

describe(planNextActions, () => {
  it("ranks easy high-severity fixes before longer, lower-severity work", () => {
    const definitions = [
      definition("listing", estimate(30, "easy"), 10),
      definition("hours", estimate(15, "easy"), 4),
      definition("banner", estimate(30, "easy"), 1),
      definition("rating", estimate(480, "medium"), 3),
      definition("canonical", estimate(30, "medium"), 2),
    ];
    const groups = planNextActions({
      actions: [
        action("canonical", 5),
        action("banner", 4),
        action("rating", 3),
        action("hours", 2),
        action("listing", 1),
      ],
      category: "services",
      definitions,
    });

    expect(groups.map((group) => group.difficulty)).toStrictEqual([
      "easy",
      "intermediate",
      "hard",
    ]);
    expect(groups[0]?.bands.map((band) => band.severity)).toStrictEqual([
      "high",
      "medium",
      "low",
    ]);
    expect(
      groups.flatMap((group) =>
        group.bands.flatMap((band) =>
          band.actions.map((item) => item.action.checkIds[0])
        )
      )
    ).toStrictEqual(["listing", "hours", "banner", "canonical", "rating"]);
    expect(
      groups.flatMap((group) =>
        group.bands.flatMap((band) => band.actions.map((item) => item.rank))
      )
    ).toStrictEqual([1, 2, 3, 4, 5]);
  });

  it("uses the hardest cited check and the highest points", () => {
    const definitions = [
      definition("quick", estimate(10, "easy"), 2),
      definition("slow", estimate(240, "medium"), 8),
    ];
    const groups = planNextActions({
      actions: [
        {
          checkIds: ["quick", "slow"],
          priority: 1,
          text: "Fix both.",
        },
      ],
      category: "retail",
      definitions,
    });

    expect(groups).toMatchObject([
      {
        bands: [
          {
            actions: [{ difficulty: "hard", minutes: 240, points: 8, rank: 1 }],
            severity: "high",
          },
        ],
        difficulty: "hard",
      },
    ]);
  });

  it("treats a missing estimate as intermediate and low severity", () => {
    const groups = planNextActions({
      actions: [action("unknown", 1)],
      category: "other",
      definitions: [definition("unknown", "No fix guide.", 1)],
    });

    expect(groups[0]?.difficulty).toBe("intermediate");
    expect(groups[0]?.bands[0]?.severity).toBe("low");
    expect(groups[0]?.bands[0]?.actions[0]?.minutes).toBeNull();
  });
});

describe("severity and duration labels", () => {
  it("bands points into high, medium, and low", () => {
    expect(severityFromPoints(10)).toBe("high");
    expect(severityFromPoints(6)).toBe("high");
    expect(severityFromPoints(5)).toBe("medium");
    expect(severityFromPoints(3)).toBe("medium");
    expect(severityFromPoints(2)).toBe("low");
  });

  it("formats durations in minutes or whole hours", () => {
    expect(formatFixDuration(15)).toBe("About 15 minutes");
    expect(formatFixDuration(60)).toBe("About 1 hour");
    expect(formatFixDuration(90)).toBe("About 90 minutes");
    expect(formatFixDuration(480)).toBe("About 8 hours");
  });
});
