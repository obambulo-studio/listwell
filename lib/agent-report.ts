import {
  assertAgentBusinessOwned,
  listAgentBusinessesForUser,
} from "@/lib/agent-api-keys";
import { runBusinessCheckBatch } from "@/lib/audit-jobs";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "@/lib/chat-onboarding";
import { checksForCategory } from "@/lib/checks/registry";
import { pointsFor } from "@/lib/checks/types";
import { getBusiness } from "@/lib/data";
import { reportShowsFixSteps } from "@/lib/entitlements-access";
import { planNextActions } from "@/lib/fix-plan";
import { getReportAccessForUser } from "@/lib/polar-server";
import { buildReportAiInstructionsMarkdown } from "@/lib/report-ai-instructions";
import { checkResultSchema } from "@/lib/schema";
import { listwellSiteUrl } from "@/lib/site-metadata";
import { buildFallbackSummary, completedCheckSchema } from "@/lib/summaries";

const missingCheck = () =>
  checkResultSchema.parse({
    label: "This check could not run",
    type: "check",
    value: null,
  });

export const listBusinessesForAgent = (userId: string) =>
  listAgentBusinessesForUser(userId);

export type AgentBusinessReportOutcome =
  | { body: Record<string, unknown>; ok: true }
  | { error: string; ok: false; status: number };

export const getBusinessReportForAgent = async (
  userId: string,
  businessId: string
): Promise<AgentBusinessReportOutcome> => {
  const owned = await assertAgentBusinessOwned(userId, businessId);
  if (!owned) {
    return {
      error: "Business not found on your account.",
      ok: false,
      status: 404,
    };
  }

  const business = await getBusiness(businessId);
  if (!business) {
    return { error: "Business not found.", ok: false, status: 404 };
  }

  const access = await getReportAccessForUser(businessId, userId);
  const showFixSteps = reportShowsFixSteps(access);

  const definitions = checksForCategory(business.category);
  const batch = await runBusinessCheckBatch(business, {
    reuseStoredQueued: true,
  });

  const checks = definitions.map((definition) => {
    const result = batch.results[definition.id] ?? missingCheck();
    return {
      category: definition.channelCategory,
      definition,
      label: result.label,
      status: statusFromResult(result),
      title: definition.title,
    };
  });

  const completed = checks.flatMap((check) => {
    if (
      check.status !== "pass" &&
      check.status !== "fail" &&
      check.status !== "error"
    ) {
      return [];
    }
    return [
      completedCheckSchema.parse({
        channelCategory: check.category,
        id: check.definition.id,
        points: pointsFor(check.definition, business.category),
        status: check.status,
        title: check.title,
        ...(check.label ? { label: check.label } : {}),
      }),
    ];
  });

  const summary = buildFallbackSummary(
    completed,
    completed.length === 0 ? "no_completed_checks" : "ai_binding_missing"
  );
  const counts = visibilityCounts(checks);
  const fixPlan = planNextActions({
    actions: summary.nextActions,
    category: business.category,
    definitions,
  });

  const markdown = buildReportAiInstructionsMarkdown({
    businessName: business.name,
    definitions,
    fixPlan,
    includeFixSteps: showFixSteps,
    overview: summary.overview,
    visibilityScore: scorePercent(counts),
  });

  const origin = listwellSiteUrl();
  const reportUrl = `${origin}/${encodeURIComponent(business.id)}`;

  return {
    body: {
      businessId,
      markdown,
      plan: showFixSteps ? "full" : "preview",
      reportUrl,
      score: scorePercent(counts),
      ...(showFixSteps
        ? {}
        : {
            upgradeMessage:
              "Fix steps are locked on the free preview. Open the report URL to purchase or use Listwell billing in your account.",
            upgradeUrl: reportUrl,
          }),
    },
    ok: true,
  };
};
