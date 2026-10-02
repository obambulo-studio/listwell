import type { CheckStatus } from "./chat-onboarding";
import { FIX_DIFFICULTY_LABEL, FIX_SEVERITY_LABEL } from "./fix-plan";
import type { PlannedFixGroup } from "./fix-plan";
import { reportPdfEditionSchema, reportPdfInputSchema } from "./report-pdf";
import type { ReportPdfInput } from "./report-pdf";

export interface ReportPdfSourceCheck {
  category: string;
  label?: string;
  status: CheckStatus;
  title: string;
}

const statusWord = (status: CheckStatus): string => {
  switch (status) {
    case "pass": {
      return "Pass";
    }
    case "fail": {
      return "Fail";
    }
    case "error": {
      return "Error";
    }
    case "queued":
    case "pending": {
      return "Waiting";
    }
    default: {
      return "Idle";
    }
  }
};

const statusText = (status: CheckStatus): string => {
  switch (status) {
    case "pass": {
      return "Pass";
    }
    case "fail": {
      return "Needs work";
    }
    case "error": {
      return "Could not run";
    }
    case "queued":
    case "pending": {
      return "Waiting";
    }
    default: {
      return "Idle";
    }
  }
};

const detailForPdf = (check: ReportPdfSourceCheck): string | undefined => {
  if (check.status === "queued" || check.status === "pending") {
    return undefined;
  }
  const label = check.label?.trim();
  if (!label) {
    return undefined;
  }
  if (label.toLowerCase() === statusWord(check.status).toLowerCase()) {
    return undefined;
  }
  return label;
};

const fixSections = (
  fixPlan: readonly PlannedFixGroup[]
): { actions: string[]; title: string }[] =>
  fixPlan.flatMap((group) =>
    group.bands.map((band) => ({
      actions: band.actions.map((item) => item.action.text),
      title: `${FIX_DIFFICULTY_LABEL[group.difficulty]}, ${FIX_SEVERITY_LABEL[band.severity].toLowerCase()}`,
    }))
  );

export const reportPdfPayload = (input: {
  businessName: string;
  checks: readonly ReportPdfSourceCheck[];
  counts: { error: number; fail: number; pass: number };
  fixPlan: readonly PlannedFixGroup[];
  generatedAt?: string;
  overview: readonly { text: string }[];
  showFixSteps: boolean;
  visibilityScore: number;
}): ReportPdfInput =>
  reportPdfInputSchema.parse({
    businessName: input.businessName,
    checks: input.checks.map((check) => {
      const detail = detailForPdf(check);
      return {
        category: check.category,
        ...(detail ? { detail } : {}),
        status: statusText(check.status),
        title: check.title,
      };
    }),
    edition: reportPdfEditionSchema.parse(
      input.showFixSteps ? "final" : "preview"
    ),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    needsWork: input.counts.fail,
    nextActionSections: input.showFixSteps ? fixSections(input.fixPlan) : [],
    nextActions: [],
    overview: input.overview.map((claim) => claim.text),
    passing: input.counts.pass,
    score: input.visibilityScore,
    skipped: input.counts.error,
  });
