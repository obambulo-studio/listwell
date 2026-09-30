import type { CategoryId } from "./category";
import { getCheckDefinition } from "./checks/registry";
import { pointsFor } from "./checks/types";

const stripMarkdown = (value: string): string =>
  value
    .replaceAll(/ \[(?<label>[^\]]+)\]\([^)]+\)/gu, (_match, ...args) => {
      const groups = args.at(-1) as { label?: string } | undefined;
      return groups?.label ? ` ${groups.label}` : _match;
    })
    .replaceAll(/[*_>#`]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();

const firstSentence = (paragraph: string): string => {
  const trimmed = stripMarkdown(paragraph);
  const match = trimmed.match(/^(?<sentence>.+?[.!?])(?:\s|$)/u);
  const sentence = match?.groups?.sentence ?? trimmed;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trim()}…` : sentence;
};

export const hintFromCheckBody = (body: string): string | null => {
  const checkingMatch = body.match(
    /## What we're checking\s*\n+(?<section>[\s\S]*?)(?=\n##|\n>|\n####|$)/iu
  );
  if (checkingMatch?.groups?.section) {
    const paragraph = checkingMatch.groups.section
      .split("\n\n")
      .find((block) => {
        const line = block.trim();
        return line.length > 0 && !line.startsWith(">");
      });
    if (paragraph) {
      return firstSentence(paragraph);
    }
  }

  const fixMatch = body.match(
    /## How (?:can I fix it|to Fix This)\s*\n+(?<section>[\s\S]*?)(?=\n##|\n\*About|$)/iu
  );
  if (fixMatch?.groups?.section) {
    const step = fixMatch.groups.section.match(
      /###\s*1\.[^\n]*\n+(?<step>[\s\S]*?)(?=\n###|\n##|$)/iu
    );
    if (step?.groups?.step) {
      return firstSentence(step.groups.step);
    }
  }

  return null;
};

export interface CheckFixItem {
  hint: string | null;
  id: string;
  title: string;
}

export const checkFixItem = (checkId: string): CheckFixItem => {
  const definition = getCheckDefinition(checkId);
  const title = definition?.title ?? checkId;
  const hint = definition?.body ? hintFromCheckBody(definition.body) : null;
  return { hint, id: checkId, title };
};

export const failingCheckIds = (snapshot: {
  results: Record<string, { value: boolean | null }> | null;
}): string[] => {
  if (!snapshot.results) {
    return [];
  }
  const ids: string[] = [];
  for (const [id, result] of Object.entries(snapshot.results)) {
    if (result.value === false) {
      ids.push(id);
    }
  }
  return ids;
};

export const rankFailingChecks = (
  checkIds: string[],
  category: CategoryId
): string[] =>
  [...checkIds].toSorted((left, right) => {
    const leftDef = getCheckDefinition(left);
    const rightDef = getCheckDefinition(right);
    const leftPoints = leftDef ? pointsFor(leftDef, category) : 0;
    const rightPoints = rightDef ? pointsFor(rightDef, category) : 0;
    return rightPoints - leftPoints;
  });
