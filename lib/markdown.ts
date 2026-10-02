import { z } from "zod";

export const mdcToMarkdown = (source: string): string => {
  const withoutFrontmatter = source.replace(/^---[\s\S]*?---\n/u, "");

  return withoutFrontmatter
    .replaceAll(
      /::tech-detail\{summary="(?<summary>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, summary: string, body: string) =>
        `### ${summary.trim()}\n\n${body.trim()}\n`
    )
    .replaceAll(
      /::impact\{[^}]*\}(?<body>[\s\S]*?)::/gu,
      (_match, body: string) => `> ${body.trim().replaceAll(/\n+/gu, "\n> ")}\n`
    )
    .replaceAll(
      /::fix-step\{number="(?<number>\d+)" title="(?<title>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, number: string, title: string, body: string) =>
        `### ${number}. ${title}\n\n${body.trim()}\n`
    )
    .replaceAll(
      /::time-estimate\{minutes="(?<minutes>\d+)" difficulty="(?<difficulty>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, minutes: string, difficulty: string, body: string) =>
        `*About ${minutes} minutes. Difficulty: ${difficulty}.*\n\n${body.trim()}\n`
    )
    .replaceAll(
      /::example\{type="[^"]*" title="(?<title>[^"]*)"\}(?<body>[\s\S]*?)::/gu,
      (_match, title: string, body: string) =>
        `#### ${title}\n\n${body.trim()}\n`
    )
    .replaceAll(/::\w+\{[^}]*\}/gu, "")
    .replaceAll(/^::$/gmu, "");
};

export interface FixInstructionStep {
  body: string;
  title: string;
}

export interface FixInstructions {
  estimate: string | null;
  intro: string | null;
  steps: FixInstructionStep[];
}

const FIX_SECTION_PATTERN =
  /(?:^|\n)## How (?:can I fix it\?|to Fix This)\s*\n+(?<section>[\s\S]*?)(?=\n## |$)/iu;

const ESTIMATE_PATTERN =
  /\*About (?<minutes>\d+) minutes\. Difficulty: (?<difficulty>[^*]+)\.\*/u;

const STEP_PATTERN =
  /(?:^|\n)### (?:\d+\.\s+)?(?<title>[^\n]+)\n(?<body>[\s\S]*?)(?=\n### |$)/gu;

const minutesSchema = z.coerce.number().int().positive();

export interface FixEffort {
  difficulty: string;
  minutes: number;
}

export const fixEffortFromBody = (body: string): FixEffort | null => {
  const estimateMatch = ESTIMATE_PATTERN.exec(body);
  const minutes = estimateMatch?.groups?.minutes;
  const difficulty = estimateMatch?.groups?.difficulty?.trim();
  const parsedMinutes = minutesSchema.safeParse(minutes);
  if (!difficulty || !parsedMinutes.success) {
    return null;
  }
  return { difficulty, minutes: parsedMinutes.data };
};

const sentenceDifficulty = (difficulty: string): string => {
  const trimmed = difficulty.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
};

const estimateFromSection = (section: string): string | null => {
  const estimateMatch = ESTIMATE_PATTERN.exec(section);
  const minutes = estimateMatch?.groups?.minutes;
  const difficulty = estimateMatch?.groups?.difficulty;
  if (!(minutes && difficulty)) {
    return null;
  }
  return `About ${minutes} minutes. ${sentenceDifficulty(difficulty)}.`;
};

const stepsFromSection = (section: string): FixInstructionStep[] => {
  const steps: FixInstructionStep[] = [];
  for (const match of section.matchAll(STEP_PATTERN)) {
    const title = match.groups?.title?.trim();
    if (!title) {
      continue;
    }
    steps.push({
      body: match.groups?.body?.trim() ?? "",
      title,
    });
  }
  return steps;
};

export const fixInstructionsFromBody = (
  body: string
): FixInstructions | null => {
  const section = FIX_SECTION_PATTERN.exec(body)?.groups?.section?.trim();
  if (!section) {
    return null;
  }

  const estimate = estimateFromSection(section);
  const withoutEstimate = section.replace(ESTIMATE_PATTERN, "").trim();
  const steps = stepsFromSection(withoutEstimate);

  if (steps.length === 0) {
    if (withoutEstimate.length === 0) {
      return null;
    }
    return { estimate, intro: withoutEstimate, steps };
  }

  const firstStep = withoutEstimate.search(/^### /mu);
  const introSource =
    firstStep === -1 ? "" : withoutEstimate.slice(0, firstStep);
  const intro = introSource.trim();

  return {
    estimate,
    intro: intro.length > 0 ? intro : null,
    steps,
  };
};

export const fixStepsClipboardText = (body: string): string | null => {
  const instructions = fixInstructionsFromBody(body);
  if (!instructions) {
    return null;
  }

  const parts: string[] = [];
  if (instructions.intro) {
    parts.push(instructions.intro);
  }
  for (const [index, step] of instructions.steps.entries()) {
    const lines = [`${index + 1}. ${step.title}`];
    if (step.body.length > 0) {
      lines.push(step.body);
    }
    parts.push(lines.join("\n"));
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n\n");
};
