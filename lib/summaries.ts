import { z } from "zod";

export const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export const completedCheckStatusSchema = z.enum(["pass", "fail", "error"]);

export const completedCheckSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  channelCategory: z.string().min(1),
  status: completedCheckStatusSchema,
  points: z.number().nonnegative(),
  label: z.string().optional(),
});

export const citedClaimSchema = z.object({
  text: z.string().min(1),
  checkIds: z.array(z.string().min(1)).min(1),
});

export const nextActionSchema = z.object({
  text: z.string().min(1),
  checkIds: z.array(z.string().min(1)).min(1),
  priority: z.number().int().positive(),
});

export const auditSummaryContentSchema = z.object({
  overview: z.array(citedClaimSchema),
  nextActions: z.array(nextActionSchema),
});

export const degradedReasonSchema = z.enum([
  "ai_binding_missing",
  "no_completed_checks",
  "model_output_invalid",
  "model_request_failed",
]);

export const auditSummaryResultSchema = z.object({
  available: z.boolean(),
  source: z.enum(["workers-ai", "fallback"]),
  degradedReason: degradedReasonSchema.nullable(),
  overview: z.array(citedClaimSchema),
  nextActions: z.array(nextActionSchema),
});

export type CompletedCheck = z.infer<typeof completedCheckSchema>;
export type CitedClaim = z.infer<typeof citedClaimSchema>;
export type NextAction = z.infer<typeof nextActionSchema>;
export type AuditSummaryResult = z.infer<typeof auditSummaryResultSchema>;
export type DegradedReason = z.infer<typeof degradedReasonSchema>;

export type WorkersAiBinding = {
  run: (model: string, input: unknown) => Promise<unknown>;
};

const modelTextSchema = z.union([
  z.string(),
  z.object({ response: z.string() }),
  z.object({ result: z.string() }),
  z.object({ result: z.object({ response: z.string() }) }),
]);

export function isWorkersAiBinding(value: unknown): value is WorkersAiBinding {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "run" in value && typeof value.run === "function";
}

export function resolveWorkersAiBinding(...candidates: unknown[]): WorkersAiBinding | null {
  for (const candidate of candidates) {
    if (isWorkersAiBinding(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function extractModelText(value: unknown): string {
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
}

export function parseJsonObject(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object");
  }

  return JSON.parse(stripped.slice(start, end + 1));
}

export function buildListwellPrompt(businessName: string, checks: CompletedCheck[]): string {
  return [
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
}

export function introducesInventedScore(text: string, checks: CompletedCheck[]): boolean {
  const sourceText = checks
    .map((check) => `${check.title} ${check.label ?? ""} ${check.points}`)
    .join(" ")
    .toLowerCase();

  const percents = text.match(/\d+(?:\.\d+)?%/g) ?? [];
  for (const percent of percents) {
    if (!sourceText.includes(percent.toLowerCase())) {
      return true;
    }
  }

  if (/\bscore\b/i.test(text) && !/\bscore\b/i.test(sourceText)) {
    return true;
  }

  return false;
}

function retainCitedClaims<T extends { text: string; checkIds: string[] }>(
  items: T[],
  checkIds: Set<string>,
  checks: CompletedCheck[],
): T[] {
  return items
    .map((item) => ({
      ...item,
      checkIds: item.checkIds.filter((id) => checkIds.has(id)),
    }))
    .filter((item) => item.checkIds.length > 0)
    .filter((item) => !introducesInventedScore(item.text, checks));
}

export function filterToCitedChecks(
  content: z.infer<typeof auditSummaryContentSchema>,
  checks: CompletedCheck[],
): z.infer<typeof auditSummaryContentSchema> | null {
  const checkIds = new Set(checks.map((check) => check.id));
  const overview = retainCitedClaims(content.overview, checkIds, checks);
  const nextActions = retainCitedClaims(content.nextActions, checkIds, checks).sort(
    (left, right) => left.priority - right.priority,
  );

  if (overview.length === 0) {
    return null;
  }

  return { overview, nextActions };
}

export function buildFallbackSummary(checks: CompletedCheck[], reason: DegradedReason): AuditSummaryResult {
  if (checks.length === 0) {
    return {
      available: false,
      source: "fallback",
      degradedReason: reason === "ai_binding_missing" ? reason : "no_completed_checks",
      overview: [],
      nextActions: [],
    };
  }

  const failed = [...checks]
    .filter((check) => check.status === "fail" || check.status === "error")
    .sort((left, right) => right.points - left.points);
  const passed = checks.filter((check) => check.status === "pass");
  const overview: CitedClaim[] = [];
  const highest = failed[0];

  if (failed.length === 1 && highest) {
    overview.push({
      text: `${highest.title} did not pass.`,
      checkIds: [highest.id],
    });
  } else if (failed.length > 1 && highest) {
    overview.push({
      text: `${failed.length} checks did not pass. The highest-weight miss is ${highest.title}.`,
      checkIds: failed.map((check) => check.id),
    });
  } else if (passed.length > 0) {
    overview.push({
      text: `All ${passed.length} completed checks passed.`,
      checkIds: passed.map((check) => check.id),
    });
  }

  const nextActions: NextAction[] = failed.map((check, index) => ({
    priority: index + 1,
    text: check.label ? `Fix ${check.title}: ${check.label}` : `Fix ${check.title}.`,
    checkIds: [check.id],
  }));

  return {
    available: false,
    source: "fallback",
    degradedReason: reason,
    overview,
    nextActions,
  };
}

/**
 * LIST-3. Call with the Workers AI binding from wrangler.jsonc (`env.AI`).
 * Never invent a second client. Missing bindings fall back to a cited brief.
 */
export async function summarizeAuditChecks(input: {
  businessName: string;
  checks: unknown;
  ai: WorkersAiBinding | null;
}): Promise<AuditSummaryResult> {
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
        { role: "system", content: "You return valid JSON only. You never invent scores. You write for Listwell." },
        { role: "user", content: buildListwellPrompt(input.businessName, checks) },
      ],
    });
    const content = auditSummaryContentSchema.parse(parseJsonObject(extractModelText(raw)));
    const cited = filterToCitedChecks(content, checks);

    if (!cited) {
      return buildFallbackSummary(checks, "model_output_invalid");
    }

    return {
      available: true,
      source: "workers-ai",
      degradedReason: null,
      overview: cited.overview,
      nextActions: cited.nextActions,
    };
  } catch {
    return buildFallbackSummary(checks, "model_request_failed");
  }
}

export async function summarizeReport(input: {
  businessName: string;
  checks: unknown;
  ai: WorkersAiBinding | null;
}): Promise<AuditSummaryResult> {
  return summarizeAuditChecks(input);
}
