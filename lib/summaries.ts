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

export type CompletedCheck = z.infer<typeof completedCheckSchema>;
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

  return JSON.parse(stripped.slice(start, end + 1));
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
    "- Plain language for a business owner.",
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
  const [highest] = failed;

  if (failed.length === 1 && highest) {
    overview.push({
      checkIds: [highest.id],
      text: `${highest.title} did not pass.`,
    });
  } else if (failed.length > 1 && highest) {
    overview.push({
      checkIds: failed.map((check) => check.id),
      text: `${failed.length} checks did not pass. The highest-weight miss is ${highest.title}.`,
    });
  } else if (passed.length > 0) {
    overview.push({
      checkIds: passed.map((check) => check.id),
      text: `All ${passed.length} completed checks passed.`,
    });
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
            "You return valid JSON only. You never invent scores. You write for Listwell.",
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
