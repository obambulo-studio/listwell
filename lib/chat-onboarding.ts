import { z } from "zod";

import { categoryIdSchema, CATEGORY_CONFIG } from "./category";
import type { CategoryId } from "./category";
import { lookupResponseSchema, placeCandidateSchema } from "./discover";
import type { PlaceCandidate, lookupProvidersSchema } from "./discover";
import { normalizeCategoryText } from "./text-normalize";

export const LOOKUP_TIMEOUT_MS = 12_000;

export type LookupSkipReason = "empty" | "unavailable" | "error" | "timeout";

export type ListingLookupResult =
  | { kind: "candidates"; candidates: PlaceCandidate[] }
  | { kind: "skipped"; reason: LookupSkipReason };

export const listingLookupSkipMessage = (reason: LookupSkipReason): string => {
  switch (reason) {
    case "unavailable": {
      return "Listing search is not configured on this server, so we could not look up Google or Apple Maps. Paste your website URL, or type skip to continue.";
    }
    case "timeout": {
      return "Listing search timed out. Paste your website URL, or type skip to continue.";
    }
    case "error": {
      return "Listing search failed. Paste your website URL, or type skip to continue.";
    }
    case "empty": {
      return "We could not find a matching listing on Google or Apple Maps for that name and area. Paste your website URL, or type skip to continue.";
    }
    default: {
      return "Listing search is unavailable. Paste your website URL, or type skip to continue.";
    }
  }
};

const mapProviders = (
  providers: z.infer<typeof lookupProvidersSchema> | undefined
): z.infer<typeof lookupProvidersSchema> =>
  providers ?? { apple: false, google: false, osm: true };

const skipReasonFromLookup = (
  providers: z.infer<typeof lookupProvidersSchema>,
  candidateCount: number
): LookupSkipReason => {
  if (candidateCount > 0) {
    return "empty";
  }
  if (!providers.google && !providers.apple) {
    return "unavailable";
  }
  return "empty";
};

export const chatPhaseSchema = z.enum([
  "business_name",
  "location",
  "identifying",
  "listing",
  "website",
  "category",
  "auditing",
  "report",
  "upsell",
]);
export type ChatPhase = z.infer<typeof chatPhaseSchema>;

export const chatDraftSchema = z.object({
  address: z.string().optional(),
  appleMapsId: z.string().optional(),
  businessName: z.string(),
  categoryId: categoryIdSchema,
  facebookUrl: z.string().optional(),
  googlePlaceId: z.string().optional(),
  instagramUsername: z.string().optional(),
  listingUrl: z.string().optional(),
  location: z.string(),
  websiteUrl: z.string().optional(),
});
export type ChatDraft = z.infer<typeof chatDraftSchema>;

export interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  /** Onboarding question shown as a prompt card. */
  isPrompt?: boolean;
  /** User reply attached to the prompt card surface. */
  userAnswer?: string;
}

export const createMessage = (
  role: ChatMessage["role"],
  text: string
): ChatMessage => ({ id: crypto.randomUUID(), role, text });

export const createPromptMessage = (text: string): ChatMessage => ({
  id: crypto.randomUUID(),
  isPrompt: true,
  role: "assistant",
  text,
});

const TEXT_INPUT_PHASES = new Set<ChatPhase>([
  "business_name",
  "location",
  "website",
]);

export const isTextInputPhase = (phase: ChatPhase): boolean =>
  TEXT_INPUT_PHASES.has(phase);

export const isPromptInputPhase = (phase: ChatPhase): boolean =>
  TEXT_INPUT_PHASES.has(phase) || phase === "category";

export const COMMON_CATEGORY_OPTIONS = [
  { categoryId: "food", label: "Restaurant" },
  { categoryId: "food", label: "Café" },
  { categoryId: "retail", label: "Retail" },
  { categoryId: "services", label: "Services" },
  { categoryId: "services", label: "Health & beauty" },
  { categoryId: "services", label: "Trades" },
  { categoryId: "services", label: "Professional services" },
  { categoryId: "other", label: "Other" },
] as const satisfies readonly { label: string; categoryId: CategoryId }[];

export const commonCategoryLabels = (): string[] =>
  COMMON_CATEGORY_OPTIONS.map((item) => item.label);

export const categoryLabel = (id: CategoryId): string =>
  CATEGORY_CONFIG[id].label;

export const categoryFromLabel = (label: string): CategoryId | null => {
  const entry = Object.values(CATEGORY_CONFIG).find(
    (item) => item.label === label
  );
  return entry?.id ?? null;
};

export const categoryFromInput = (
  text: string
): {
  categoryId: CategoryId;
  displayLabel: string;
} => {
  const trimmed = text.trim();
  const fromLabel = categoryFromLabel(trimmed);
  if (fromLabel) {
    return { categoryId: fromLabel, displayLabel: categoryLabel(fromLabel) };
  }

  const lower = trimmed.toLowerCase();
  for (const option of COMMON_CATEGORY_OPTIONS) {
    if (option.label.toLowerCase() === lower) {
      return { categoryId: option.categoryId, displayLabel: option.label };
    }
  }

  return { categoryId: "other", displayLabel: normalizeCategoryText(trimmed) };
};

export const listingQuestion = (candidates: PlaceCandidate[]) => ({
  options: [...candidates.slice(0, 4).map((c) => c.name), "None of these"],
  q: "Is this your business on Google or Apple Maps?",
  type: "radio" as const,
});

export const categoryQuestion = () => ({
  options: Object.values(CATEGORY_CONFIG).map((item) => item.label),
  q: "What type of business is it?",
  type: "radio" as const,
});

const requestListingLookup = async (
  businessName: string,
  location: string,
  signal: AbortSignal
): Promise<ListingLookupResult> => {
  const params = new URLSearchParams({
    q: businessName.trim(),
    source: "places",
  });
  const trimmedLocation = location.trim();
  if (trimmedLocation) {
    params.set("near", trimmedLocation);
  }
  const response = await fetch(`/api/lookups?${params.toString()}`, { signal });
  if (!response.ok) {
    return { kind: "skipped", reason: "error" };
  }
  const parsed = lookupResponseSchema.parse(await response.json());
  if (parsed.candidates.length === 0) {
    return {
      kind: "skipped",
      reason: skipReasonFromLookup(
        mapProviders(parsed.providers),
        parsed.candidates.length
      ),
    };
  }
  return { candidates: parsed.candidates, kind: "candidates" };
};

export const fetchListingCandidates = async (
  businessName: string,
  location: string,
  timeoutMs: number = LOOKUP_TIMEOUT_MS
): Promise<ListingLookupResult> => {
  const trimmedName = businessName.trim();
  if (!trimmedName) {
    return { kind: "skipped", reason: "empty" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await requestListingLookup(trimmedName, location, controller.signal);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { kind: "skipped", reason: "timeout" };
    }
    return { kind: "skipped", reason: "error" };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const promptForPhase = (
  phase: ChatPhase,
  businessName?: string
): string => {
  switch (phase) {
    case "business_name": {
      return "What is your business called?";
    }
    case "location": {
      return businessName
        ? `Where is ${businessName} located? Suburb or city is enough.`
        : "Where is your business located? Suburb or city is enough.";
    }
    case "identifying": {
      return "Looking up your business on Google and Apple Maps…";
    }
    case "listing": {
      return "Pick the listing that matches your business.";
    }
    case "website": {
      return "Do you have a website? Paste the URL, or type skip.";
    }
    case "category": {
      return "What category best describes your business?";
    }
    case "auditing": {
      return "Running your audit now. This usually takes under two minutes.";
    }
    case "report": {
      return "Here is your basic visibility report.";
    }
    case "upsell": {
      return "Want the full picture with fix steps and automation?";
    }
    default: {
      return "How can I help with your business listing?";
    }
  }
};

export const reportIssueStatusSchema = z.enum(["pass", "fail"]);
export type ReportIssueStatus = z.infer<typeof reportIssueStatusSchema>;

export const reportIssueSchema = z.object({
  status: reportIssueStatusSchema,
  title: z.string(),
});
export type ReportIssue = z.infer<typeof reportIssueSchema>;

export interface BasicReportStats {
  pass: number;
  fail: number;
  error: number;
  total: number;
  topIssues: ReportIssue[];
  channelsFound: number;
}

const TOP_ISSUE_LIMIT = 4;

/** Lower sorts earlier when picking pass highlights after failures. */
const passHighlightRank = (checkId: string): number => {
  if (checkId.startsWith("website-")) {
    return 0;
  }
  if (checkId.includes("listing") || checkId === "hours") {
    return 2;
  }
  return 1;
};

export const buildBasicReportStats = (
  results: Record<string, { value: boolean | null }>,
  checkTitles: Record<string, string>
): BasicReportStats => {
  let pass = 0;
  let fail = 0;
  let error = 0;
  const failed: ReportIssue[] = [];
  const passed: { issue: ReportIssue; checkId: string }[] = [];

  for (const [id, result] of Object.entries(results)) {
    const title = checkTitles[id];
    if (result.value === true) {
      pass += 1;
      if (title) {
        passed.push({ checkId: id, issue: { status: "pass", title } });
      }
    } else if (result.value === false) {
      fail += 1;
      if (title) {
        failed.push({ status: "fail", title });
      }
    } else {
      error += 1;
    }
  }

  passed.sort(
    (left, right) =>
      passHighlightRank(left.checkId) - passHighlightRank(right.checkId)
  );

  return {
    channelsFound: pass + fail,
    error,
    fail,
    pass,
    topIssues: [...failed, ...passed.map((entry) => entry.issue)].slice(
      0,
      TOP_ISSUE_LIMIT
    ),
    total: pass + fail + error,
  };
};

export const visibilityCounts = (
  items: readonly { status: string }[]
): {
  pass: number;
  fail: number;
  error: number;
} => {
  let pass = 0;
  let fail = 0;
  let error = 0;
  for (const item of items) {
    if (item.status === "pass") {
      pass += 1;
    } else if (item.status === "fail") {
      fail += 1;
    } else if (item.status === "error") {
      error += 1;
    }
  }
  return { error, fail, pass };
};

export const scorePercent = (stats: { pass: number; fail: number }): number => {
  const scored = stats.pass + stats.fail;
  if (scored === 0) {
    return 0;
  }
  return Math.round((stats.pass / scored) * 100);
};

export type CheckStatus =
  | "idle"
  | "pending"
  | "queued"
  | "pass"
  | "fail"
  | "error";

export const statusFromResult = (result: {
  queued?: boolean;
  value: boolean | null;
}): CheckStatus => {
  if (result.queued) {
    return "queued";
  }
  if (result.value === true) {
    return "pass";
  }
  if (result.value === false) {
    return "fail";
  }
  return "error";
};

const chatMessageSchema = z.object({
  id: z.string(),
  isPrompt: z.boolean().optional(),
  role: z.enum(["assistant", "user"]),
  text: z.string(),
  userAnswer: z.string().optional(),
});

export const basicReportStatsSchema = z.object({
  channelsFound: z.number(),
  error: z.number(),
  fail: z.number(),
  pass: z.number(),
  topIssues: z.array(reportIssueSchema),
  total: z.number(),
});

const taskDetailSchema = z.object({
  label: z.string(),
  meta: z.string(),
});

const taskRowSchema = z.object({
  amount: z.string(),
  details: z.array(taskDetailSchema),
  key: z.string(),
  label: z.string(),
  status: z.enum(["done", "running", "pending", "sequence"]),
  step: z.number().optional(),
});

export const chatSessionSnapshotSchema = z.object({
  auditTasks: z.array(taskRowSchema),
  businessId: z.string().nullable(),
  candidates: z.array(placeCandidateSchema),
  draft: chatDraftSchema,
  locationHint: z.string(),
  messages: z.array(chatMessageSchema),
  phase: chatPhaseSchema,
  reportStats: basicReportStatsSchema.nullable(),
  version: z.literal(1),
});

export type ChatSessionSnapshot = z.infer<typeof chatSessionSnapshotSchema>;
