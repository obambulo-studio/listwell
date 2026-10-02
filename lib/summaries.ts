import { z } from "zod";

export const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export const completedCheckStatusSchema = z.enum(["pass", "fail", "error"]);

export const completedCheckSchema = z.object({
  channelCategory: z.string().min(1),
  id: z.string().min(1),
  label: z.string().optional(),
  points: z.number().nonnegative(),
  status: completedCheckStatusSchema,
  title: z.string().min(1),
});

export const citedClaimSchema = z.object({
  checkIds: z.array(z.string().min(1)).min(1),
  text: z.string().min(1),
});

export const nextActionSchema = z.object({
  checkIds: z.array(z.string().min(1)).min(1),
  priority: z.number().int().positive(),
  text: z.string().min(1),
});

export const auditSummaryContentSchema = z.object({
  nextActions: z.array(nextActionSchema),
  overview: z.array(citedClaimSchema),
});

export const degradedReasonSchema = z.enum([
  "ai_binding_missing",
  "no_completed_checks",
  "model_output_invalid",
  "model_request_failed",
]);

export const auditSummaryResultSchema = z.object({
  available: z.boolean(),
  degradedReason: degradedReasonSchema.nullable(),
  nextActions: z.array(nextActionSchema),
  overview: z.array(citedClaimSchema),
  source: z.enum(["workers-ai", "fallback"]),
});

export const SUMMARY_CACHE_TTL_SECONDS = 60 * 60;

export type CompletedCheck = z.infer<typeof completedCheckSchema>;

export const summaryCacheKey = async (
  businessId: string,
  checks: readonly CompletedCheck[]
): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(checks))
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `summary:${businessId}:${hex}`;
};

export type CitedClaim = z.infer<typeof citedClaimSchema>;
export type NextAction = z.infer<typeof nextActionSchema>;
export type AuditSummaryResult = z.infer<typeof auditSummaryResultSchema>;
export type DegradedReason = z.infer<typeof degradedReasonSchema>;

export interface WorkersAiBinding {
  run: (model: string, input: unknown) => Promise<unknown>;
}

const modelTextSchema = z.union([
  z.string(),
  z.object({ response: z.string() }),
  z.object({ result: z.string() }),
  z.object({ result: z.object({ response: z.string() }) }),
]);

const FENCE_START_PATTERN = /^```(?:json)?\s*/iu;
const FENCE_END_PATTERN = /\s*```$/iu;
const PERCENT_PATTERN = /\d+(?:\.\d+)?%/gu;
const SCORE_PATTERN = /\bscore\b/iu;

export const isWorkersAiBinding = (
  value: unknown
): value is WorkersAiBinding => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "run" in value && typeof value.run === "function";
};

export const resolveWorkersAiBinding = (
  ...candidates: unknown[]
): WorkersAiBinding | null => {
  for (const candidate of candidates) {
    if (isWorkersAiBinding(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const extractModelText = (value: unknown): string => {
  const parsed = modelTextSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Workers AI returned an unexpected response shape");
  }

  if (typeof parsed.data === "string") {
    return parsed.data;
  }

  if ("response" in parsed.data) {
    return parsed.data.response;
  }

  if (typeof parsed.data.result === "string") {
    return parsed.data.result;
  }

  return parsed.data.result.response;
};

export const parseJsonObject = (text: string): unknown => {
  const stripped = text
    .trim()
    .replace(FENCE_START_PATTERN, "")
    .replace(FENCE_END_PATTERN, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object");
  }

  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new Error("Model response contained invalid JSON");
  }
};

export const buildListwellPrompt = (
  businessName: string,
  checks: CompletedCheck[]
): string =>
  [
    "You write a short Listwell executive brief from completed visibility audit checks.",
    "",
    "Rules:",
    "- Use only the checks in the JSON below.",
    "- Every overview sentence and every next action must cite one or more check ids from that JSON.",
    "- Do not invent scores, percentages, rankings, or outcomes.",
    "- You may mention a check's provided points value. Do not add those points into a new score.",
    "- Do not mention Visimate.",
    "- Product name is Listwell.",
    "- Plain language for a small business owner.",
    "- The overview should be 2–4 sentences: how many checks failed, the most important failing checks (by points), and notable passes when useful.",
    "- Use Australian English spelling (e.g. optimise, colour, organisation).",
    "- Do not use hype or invented statistics.",
    "- Prioritise next actions by the provided points, highest first.",
    "- Return JSON only, no markdown.",
    "",
    "JSON shape:",
    '{ "overview": [{ "text": string, "checkIds": string[] }], "nextActions": [{ "text": string, "checkIds": string[], "priority": number }] }',
    "",
    `Business: ${businessName}`,
    "",
    "Checks:",
    JSON.stringify(checks),
  ].join("\n");

export const introducesInventedScore = (
  text: string,
  checks: CompletedCheck[]
): boolean => {
  const sourceText = checks
    .map((check) => `${check.title} ${check.label ?? ""} ${check.points}`)
    .join(" ")
    .toLowerCase();

  const percents = text.match(PERCENT_PATTERN) ?? [];
  PERCENT_PATTERN.lastIndex = 0;
  const sourcePercents = new Set(
    (sourceText.match(PERCENT_PATTERN) ?? []).map((value) =>
      value.toLowerCase()
    )
  );
  for (const percent of percents) {
    if (!sourcePercents.has(percent.toLowerCase())) {
      return true;
    }
  }

  if (SCORE_PATTERN.test(text) && !SCORE_PATTERN.test(sourceText)) {
    return true;
  }

  return false;
};

const retainCitedClaims = <T extends { text: string; checkIds: string[] }>(
  items: T[],
  checkIds: Set<string>,
  checks: CompletedCheck[]
): T[] =>
  items.flatMap((item) => {
    const citedIds = item.checkIds.filter((id) => checkIds.has(id));
    if (citedIds.length === 0) {
      return [];
    }
    const cited = { ...item, checkIds: citedIds };
    return introducesInventedScore(cited.text, checks) ? [] : [cited];
  });

export const filterToCitedChecks = (
  content: z.infer<typeof auditSummaryContentSchema>,
  checks: CompletedCheck[]
): z.infer<typeof auditSummaryContentSchema> | null => {
  const checkIds = new Set(checks.map((check) => check.id));
  const overview = retainCitedClaims(content.overview, checkIds, checks);
  const nextActions = retainCitedClaims(
    content.nextActions,
    checkIds,
    checks
  ).toSorted((left, right) => left.priority - right.priority);

  if (overview.length === 0) {
    return null;
  }

  return { nextActions, overview };
};

const OVERVIEW_NAMED_FAILS = 3;
const OVERVIEW_NAMED_PASSES = 2;

const joinCheckTitles = (titles: string[]): string => {
  if (titles.length === 0) {
    return "";
  }
  if (titles.length === 1) {
    return titles[0] ?? "";
  }
  if (titles.length === 2) {
    return `${titles[0]} and ${titles[1]}`;
  }
  const head = titles.slice(0, -1).join(", ");
  const last = titles.at(-1);
  return `${head}, and ${last}`;
};

const passHighlightSentence = (passed: CompletedCheck[]): string | null => {
  if (passed.length === 0) {
    return null;
  }
  const named = [...passed]
    .toSorted((left, right) => right.points - left.points)
    .slice(0, OVERVIEW_NAMED_PASSES)
    .map((check) => check.title);
  const extra = passed.length - named.length;
  if (passed.length === 1) {
    return `1 other check passed: ${named[0]}.`;
  }
  let text = `${passed.length} checks passed`;
  if (named.length > 0) {
    text += `, including ${joinCheckTitles(named)}`;
  }
  if (extra > 0) {
    text += ` and ${extra} more`;
  }
  return `${text}.`;
};

const failGapSentence = (failed: CompletedCheck[]): string => {
  const named = failed
    .slice(0, OVERVIEW_NAMED_FAILS)
    .map((check) => check.title);
  const extra = failed.length - named.length;
  if (failed.length === 2) {
    return `Main gaps are ${joinCheckTitles(named)}.`;
  }
  const listed = joinCheckTitles(named);
  if (extra > 0) {
    const otherWord = extra === 1 ? "other" : "others";
    return `Main gaps include ${listed}, plus ${extra} ${otherWord}.`;
  }
  return `Main gaps include ${listed}.`;
};

/** Plain-language overview when Workers AI is unavailable or invalid. */
export const buildFallbackOverviewText = (
  failed: CompletedCheck[],
  passed: CompletedCheck[]
): string => {
  if (failed.length === 1) {
    const [only] = failed;
    if (only) {
      const parts = [`${only.title} did not pass.`];
      const passNote = passHighlightSentence(passed);
      if (passNote) {
        parts.push(passNote);
      }
      return parts.join(" ");
    }
  }
  if (failed.length > 1) {
    const parts = [
      `${failed.length} checks did not pass.`,
      failGapSentence(failed),
    ];
    const passNote = passHighlightSentence(passed);
    if (passNote) {
      parts.push(passNote);
    }
    return parts.join(" ");
  }
  if (passed.length > 0) {
    const named = [...passed]
      .toSorted((left, right) => right.points - left.points)
      .slice(0, OVERVIEW_NAMED_PASSES)
      .map((check) => check.title);
    const extra = passed.length - named.length;
    if (passed.length === 1) {
      return `All ${passed.length} completed check passed: ${named[0]}.`;
    }
    let text = `All ${passed.length} completed checks passed`;
    if (named.length > 0) {
      text += `, including ${joinCheckTitles(named)}`;
    }
    if (extra > 0) {
      text += ` and ${extra} more`;
    }
    return `${text}.`;
  }
  return "";
};

export const buildFallbackSummary = (
  checks: CompletedCheck[],
  reason: DegradedReason
): AuditSummaryResult => {
  if (checks.length === 0) {
    return {
      available: false,
      degradedReason:
        reason === "ai_binding_missing" ? reason : "no_completed_checks",
      nextActions: [],
      overview: [],
      source: "fallback",
    };
  }

  const failed = [...checks]
    .filter((check) => check.status === "fail" || check.status === "error")
    .toSorted((left, right) => right.points - left.points);
  const passed = checks.filter((check) => check.status === "pass");
  const overview: CitedClaim[] = [];
  const overviewText = buildFallbackOverviewText(failed, passed);

  if (overviewText.length > 0) {
    const checkIds =
      failed.length > 0
        ? failed.map((check) => check.id)
        : passed.map((check) => check.id);
    overview.push({ checkIds, text: overviewText });
  }

  const nextActions: NextAction[] = failed.map((check, index) => ({
    checkIds: [check.id],
    priority: index + 1,
    text: check.label
      ? `Fix ${check.title}: ${check.label}`
      : `Fix ${check.title}.`,
  }));

  return {
    available: false,
    degradedReason: reason,
    nextActions,
    overview,
    source: "fallback",
  };
};

/**
 * LIST-3. Call with the Workers AI binding from wrangler.jsonc (`env.AI`).
 * Never invent a second client. Missing bindings fall back to a cited brief.
 */
export const summarizeAuditChecks = async (input: {
  businessName: string;
  checks: unknown;
  ai: WorkersAiBinding | null;
}): Promise<AuditSummaryResult> => {
  const checks = z.array(completedCheckSchema).parse(input.checks);

  if (checks.length === 0) {
    return buildFallbackSummary(checks, "no_completed_checks");
  }

  if (!input.ai) {
    return buildFallbackSummary(checks, "ai_binding_missing");
  }

  try {
    const raw = await input.ai.run(WORKERS_AI_MODEL, {
      messages: [
        {
          content:
            "You return valid JSON only. You never invent scores. You write for Listwell in Australian English.",
          role: "system",
        },
        {
          content: buildListwellPrompt(input.businessName, checks),
          role: "user",
        },
      ],
    });
    const content = auditSummaryContentSchema.parse(
      parseJsonObject(extractModelText(raw))
    );
    const cited = filterToCitedChecks(content, checks);

    if (!cited) {
      return buildFallbackSummary(checks, "model_output_invalid");
    }

    return {
      available: true,
      degradedReason: null,
      nextActions: cited.nextActions,
      overview: cited.overview,
      source: "workers-ai",
    };
  } catch {
    return buildFallbackSummary(checks, "model_request_failed");
  }
};

export const summarizeReport = (input: {
  businessName: string;
  checks: unknown;
  ai: WorkersAiBinding | null;
}): Promise<AuditSummaryResult> => summarizeAuditChecks(input);
