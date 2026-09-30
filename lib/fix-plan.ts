import { z } from "zod";

import type { CategoryId } from "./category";
import { pointsFor } from "./checks/types";
import type { CheckDefinition } from "./checks/types";
import { fixEffortFromBody } from "./markdown";
import type { NextAction } from "./summaries";

export const fixDifficultySchema = z.enum(["easy", "intermediate", "hard"]);
export const fixSeveritySchema = z.enum(["high", "medium", "low"]);

export type FixDifficulty = z.infer<typeof fixDifficultySchema>;
export type FixSeverity = z.infer<typeof fixSeveritySchema>;

const guideDifficultySchema = z.enum([
  "easy",
  "medium",
  "intermediate",
  "hard",
]);

const DIFFICULTY_RANK: Record<FixDifficulty, number> = {
  easy: 0,
  hard: 2,
  intermediate: 1,
};

const SEVERITY_RANK: Record<FixSeverity, number> = {
  high: 0,
  low: 2,
  medium: 1,
};

/** Four hours or more is a project, even when the guide says medium. */
const HARD_MINUTES = 240;
const HIGH_POINTS = 6;
const MEDIUM_POINTS = 3;

export const FIX_DIFFICULTY_LABEL: Record<FixDifficulty, string> = {
  easy: "Easy",
  hard: "Hard",
  intermediate: "Intermediate",
};

export const FIX_SEVERITY_LABEL: Record<FixSeverity, string> = {
  high: "High severity",
  low: "Low severity",
  medium: "Medium severity",
};

export const FIX_DIFFICULTY_ORDER = fixDifficultySchema.options;
export const FIX_SEVERITY_ORDER = fixSeveritySchema.options;

const normaliseDifficulty = (label: string): FixDifficulty | null => {
  const parsed = guideDifficultySchema.safeParse(label.trim().toLowerCase());
  if (!parsed.success) {
    return null;
  }
  if (parsed.data === "medium" || parsed.data === "intermediate") {
    return "intermediate";
  }
  return parsed.data;
};

export const severityFromPoints = (points: number): FixSeverity => {
  if (points >= HIGH_POINTS) {
    return "high";
  }
  if (points >= MEDIUM_POINTS) {
    return "medium";
  }
  return "low";
};

export const formatFixDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `About ${minutes} minutes`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "About 1 hour" : `About ${hours} hours`;
  }
  return `About ${minutes} minutes`;
};

interface ResolvedEffort {
  difficulty: FixDifficulty;
  minutes: number | null;
}

const effortForDefinition = (
  definition: CheckDefinition | undefined
): ResolvedEffort => {
  if (!definition) {
    return { difficulty: "intermediate", minutes: null };
  }
  const effort = fixEffortFromBody(definition.body);
  if (!effort) {
    return { difficulty: "intermediate", minutes: null };
  }
  const difficulty = normaliseDifficulty(effort.difficulty);
  if (!difficulty) {
    return { difficulty: "intermediate", minutes: effort.minutes };
  }
  if (difficulty === "intermediate" && effort.minutes >= HARD_MINUTES) {
    return { difficulty: "hard", minutes: effort.minutes };
  }
  return { difficulty, minutes: effort.minutes };
};

const harderEffort = (
  current: ResolvedEffort,
  next: ResolvedEffort
): ResolvedEffort => {
  const currentRank = DIFFICULTY_RANK[current.difficulty];
  const nextRank = DIFFICULTY_RANK[next.difficulty];
  if (nextRank > currentRank) {
    return next;
  }
  if (nextRank < currentRank) {
    return current;
  }
  const currentMinutes = current.minutes ?? 0;
  const nextMinutes = next.minutes ?? 0;
  return nextMinutes > currentMinutes ? next : current;
};

const combinedEffort = (efforts: readonly ResolvedEffort[]): ResolvedEffort => {
  let effort: ResolvedEffort = {
    difficulty: "intermediate",
    minutes: null,
  };
  let started = false;
  for (const next of efforts) {
    effort = started ? harderEffort(effort, next) : next;
    started = true;
  }
  return effort;
};

export interface PlannedFix {
  action: NextAction;
  difficulty: FixDifficulty;
  minutes: number | null;
  points: number;
  rank: number;
  severity: FixSeverity;
}

export interface PlannedFixBand {
  actions: PlannedFix[];
  severity: FixSeverity;
}

export interface PlannedFixGroup {
  bands: PlannedFixBand[];
  difficulty: FixDifficulty;
}

export const planNextActions = (input: {
  actions: readonly NextAction[];
  category: CategoryId;
  definitions: readonly CheckDefinition[];
}): PlannedFixGroup[] => {
  const definitionsById = new Map(
    input.definitions.map((definition) => [definition.id, definition])
  );

  const planned = input.actions.map((action) => {
    const effort = combinedEffort(
      action.checkIds.map((checkId) =>
        effortForDefinition(definitionsById.get(checkId))
      )
    );
    let points = 0;
    for (const checkId of action.checkIds) {
      const definition = definitionsById.get(checkId);
      const next = definition ? pointsFor(definition, input.category) : 0;
      if (next > points) {
        points = next;
      }
    }
    return {
      action,
      difficulty: effort.difficulty,
      minutes: effort.minutes,
      points,
      severity: severityFromPoints(points),
    };
  });

  const ranked = planned.toSorted((left, right) => {
    const byDifficulty =
      DIFFICULTY_RANK[left.difficulty] - DIFFICULTY_RANK[right.difficulty];
    if (byDifficulty !== 0) {
      return byDifficulty;
    }
    const bySeverity =
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (bySeverity !== 0) {
      return bySeverity;
    }
    if (left.points !== right.points) {
      return right.points - left.points;
    }
    return left.action.priority - right.action.priority;
  });

  const withRank: PlannedFix[] = ranked.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  return FIX_DIFFICULTY_ORDER.flatMap((difficulty) => {
    const inDifficulty = withRank.filter(
      (item) => item.difficulty === difficulty
    );
    if (inDifficulty.length === 0) {
      return [];
    }
    const bands = FIX_SEVERITY_ORDER.flatMap((severity) => {
      const actions = inDifficulty.filter((item) => item.severity === severity);
      return actions.length === 0 ? [] : [{ actions, severity }];
    });
    return [{ bands, difficulty }];
  });
};
