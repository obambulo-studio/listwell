import type { CheckDefinition } from "./checks/types";
import {
  FIX_DIFFICULTY_LABEL,
  FIX_SEVERITY_LABEL,
  formatFixDuration,
} from "./fix-plan";
import type { PlannedFixGroup } from "./fix-plan";
import {
  buildListingReviewFixPrompt,
  listingReviewHasFixPrompt,
} from "./listing-review";
import type { ListingReviewContent } from "./listing-review";
import { fixInstructionsFromBody } from "./markdown";

const slugifyFilename = (value: string): string => {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
  return slug.length > 0 ? slug : "report";
};

export const reportAiInstructionsFilename = (businessName: string): string =>
  `${slugifyFilename(businessName)}-ai-instructions.md`;

const fixGuideMarkdown = (body: string): string | null => {
  const instructions = fixInstructionsFromBody(body);
  if (!instructions) {
    return null;
  }
  const parts: string[] = [];
  if (instructions.intro) {
    parts.push(instructions.intro);
  }
  for (const [index, step] of instructions.steps.entries()) {
    parts.push(`${index + 1}. **${step.title}**`);
    if (step.body.length > 0) {
      parts.push(step.body);
    }
  }
  if (instructions.estimate) {
    parts.push(`_${instructions.estimate}_`);
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n\n");
};

export const reportAiInstructionsHasContent = (input: {
  fixPlan: PlannedFixGroup[];
  includeFixSteps: boolean;
  listingReview?: ListingReviewContent | null;
}): boolean => {
  const hasFixSteps =
    input.includeFixSteps &&
    input.fixPlan.some((group) =>
      group.bands.some((band) => band.actions.length > 0)
    );
  const hasListing =
    input.listingReview !== undefined &&
    input.listingReview !== null &&
    listingReviewHasFixPrompt(input.listingReview);
  return hasFixSteps || hasListing;
};

const fixStepsMarkdown = (
  fixPlan: PlannedFixGroup[],
  definitionsById: Map<string, CheckDefinition>
): string[] => {
  const fixBlocks: string[] = [];
  for (const group of fixPlan) {
    for (const band of group.bands) {
      if (band.actions.length === 0) {
        continue;
      }
      fixBlocks.push(
        `### ${FIX_DIFFICULTY_LABEL[group.difficulty]} · ${FIX_SEVERITY_LABEL[band.severity].toLowerCase()}`,
        ""
      );
      for (const item of band.actions) {
        const actionLines = [`#### ${item.rank}. ${item.action.text}`, ""];
        if (item.minutes !== null) {
          actionLines.push(formatFixDuration(item.minutes), "");
        }
        const checkTitles = item.action.checkIds.flatMap((checkId) => {
          const definition = definitionsById.get(checkId);
          return definition ? [`${definition.title} (\`${checkId}\`)`] : [];
        });
        if (checkTitles.length > 0) {
          actionLines.push(`Related checks: ${checkTitles.join(", ")}`, "");
        }
        for (const checkId of item.action.checkIds) {
          const definition = definitionsById.get(checkId);
          if (!definition) {
            continue;
          }
          if (item.action.checkIds.length > 1) {
            actionLines.push(`##### ${definition.title}`, "");
          }
          const guide = fixGuideMarkdown(definition.body);
          actionLines.push(
            guide ??
              "_Fix steps are not written for this check yet. Use the action summary above._",
            ""
          );
        }
        actionLines.push("---", "");
        fixBlocks.push(...actionLines);
      }
    }
  }
  if (fixBlocks.length === 0) {
    return [];
  }
  return ["## Audit fix steps", "", ...fixBlocks];
};

export const buildReportAiInstructionsMarkdown = (input: {
  businessName: string;
  definitions: readonly CheckDefinition[];
  fixPlan: PlannedFixGroup[];
  includeFixSteps: boolean;
  listingReview?: ListingReviewContent | null;
  overview?: readonly { text: string }[];
  visibilityScore?: number;
}): string => {
  const definitionsById = new Map(
    input.definitions.map((definition) => [definition.id, definition])
  );

  const header = [
    `# Visibility fixes for ${input.businessName}`,
    "",
    "Paste this document into an AI assistant (Cursor, Claude, Copilot, etc.) to implement Listwell's recommendations. Verify every change before publishing.",
    "",
  ];

  const scoreBlock =
    input.visibilityScore === undefined
      ? []
      : [`Visibility score: ${input.visibilityScore}%`, ""];

  const overviewBlock =
    input.overview && input.overview.length > 0
      ? [
          "## Summary",
          "",
          ...input.overview.map((claim) => `- ${claim.text}`),
          "",
        ]
      : [];

  const fixBlock = input.includeFixSteps
    ? fixStepsMarkdown(input.fixPlan, definitionsById)
    : [];

  const listingBlock =
    input.listingReview && listingReviewHasFixPrompt(input.listingReview)
      ? [
          buildListingReviewFixPrompt({
            businessName: input.businessName,
            content: input.listingReview,
          })
            .replace(
              `# Listing improvements for ${input.businessName}`,
              "## AI listing review"
            )
            .replace(/\n---\n\nConstraints:[\s\S]*$/u, "")
            .trim(),
          "",
        ]
      : [];

  const footer = [
    "---",
    "",
    "Constraints:",
    "- Do not invent addresses, phone numbers, hours, or review text.",
    "- Prefer minimal, targeted edits over broad rewrites.",
    "- Keep Australian English spelling and tone where applicable.",
  ];

  return `${[
    ...header,
    ...scoreBlock,
    ...overviewBlock,
    ...fixBlock,
    ...listingBlock,
    ...footer,
  ]
    .join("\n")
    .trim()}\n`;
};

export const downloadReportMarkdown = (
  markdown: string,
  filename: string
): void => {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
