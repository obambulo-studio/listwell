import { getCheckDefinition } from "./checks/registry";
import { SCORE_DROP_ALERT_POINTS } from "./scan-config";

export interface ScanCheckResult {
  value: boolean | null;
  label?: string;
}

export interface ScanSnapshot {
  score: number | null;
  results: Record<string, ScanCheckResult> | null;
}

export type ScanEmailKind = "monthly_summary" | "score_alert";

export interface ScanEmailContent {
  kind: ScanEmailKind;
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const checkTitle = (checkId: string): string =>
  getCheckDefinition(checkId)?.title ?? checkId;

export const newlyBrokenChecks = (
  previous: ScanSnapshot | null,
  current: ScanSnapshot
): string[] => {
  if (!previous?.results || !current.results) {
    return [];
  }
  const broken: string[] = [];
  for (const [id, result] of Object.entries(current.results)) {
    if (result.value !== false) {
      continue;
    }
    const prior = previous.results[id];
    if (!prior || prior.value !== false) {
      broken.push(id);
    }
  }
  return broken;
};

export const scoreDelta = (
  previous: ScanSnapshot | null,
  current: ScanSnapshot
): number | null => {
  if (previous?.score === null || previous?.score === undefined) {
    return null;
  }
  if (current.score === null || current.score === undefined) {
    return null;
  }
  return current.score - previous.score;
};

export const pickScanEmailKind = (
  previous: ScanSnapshot | null,
  current: ScanSnapshot
): ScanEmailKind => {
  const delta = scoreDelta(previous, current);
  const broken = newlyBrokenChecks(previous, current);
  if (
    broken.length > 0 ||
    (delta !== null && delta <= -SCORE_DROP_ALERT_POINTS)
  ) {
    return "score_alert";
  }
  return "monthly_summary";
};

const formatDeltaLine = (delta: number | null): string => {
  if (delta === null) {
    return "Score change: not enough history to compare yet.";
  }
  if (delta === 0) {
    return "Score change: no change since your last scan.";
  }
  const direction = delta > 0 ? "up" : "down";
  return `Score change: ${direction} ${Math.abs(delta)} points (${delta > 0 ? "+" : ""}${delta}).`;
};

const brokenLines = (checkIds: string[]): string => {
  if (checkIds.length === 0) {
    return "";
  }
  const lines = checkIds.map((id) => `- ${checkTitle(id)}`);
  return `\n\nChecks that need attention:\n${lines.join("\n")}`;
};

const alertHtmlBody = (
  businessName: string,
  scoreLine: string,
  deltaLine: string,
  broken: string[],
  reportUrl: string,
  unsubscribeUrl?: string
): string => {
  const brokenBlock =
    broken.length > 0
      ? `<p><strong>Checks that need attention</strong></p><ul>${broken.map((id) => `<li>${escapeHtml(checkTitle(id))}</li>`).join("")}</ul>`
      : "";
  const footer = unsubscribeUrl
    ? `<p style="font-size:12px;color:#666">Manage email notifications: <a href="${escapeHtml(unsubscribeUrl)}">preferences</a></p>`
    : "";
  return `<p>Hi,</p><p>Your scheduled Listwell scan for <strong>${escapeHtml(businessName)}</strong> found issues worth fixing soon.</p><p>${escapeHtml(scoreLine)}<br>${escapeHtml(deltaLine)}</p>${brokenBlock}<p><a href="${escapeHtml(reportUrl)}">View the full report</a></p>${footer}`;
};

const summaryHtmlBody = (
  businessName: string,
  scoreLine: string,
  deltaLine: string,
  broken: string[],
  reportUrl: string,
  unsubscribeUrl?: string
): string => {
  const brokenBlock =
    broken.length > 0
      ? `<p><strong>Checks that need attention</strong></p><ul>${broken.map((id) => `<li>${escapeHtml(checkTitle(id))}</li>`).join("")}</ul>`
      : "";
  const footer = unsubscribeUrl
    ? `<p style="font-size:12px;color:#666">Manage email notifications: <a href="${escapeHtml(unsubscribeUrl)}">preferences</a></p>`
    : "";
  return `<p>Hi,</p><p>Your monthly Listwell scan for <strong>${escapeHtml(businessName)}</strong> is ready.</p><p>${escapeHtml(scoreLine)}<br>${escapeHtml(deltaLine)}</p>${brokenBlock}<p><a href="${escapeHtml(reportUrl)}">View the report</a></p>${footer}`;
};

export const buildScanEmail = (input: {
  businessName: string;
  reportUrl: string;
  previous: ScanSnapshot | null;
  current: ScanSnapshot;
  unsubscribeUrl?: string;
}): ScanEmailContent => {
  const delta = scoreDelta(input.previous, input.current);
  const broken = newlyBrokenChecks(input.previous, input.current);
  const kind = pickScanEmailKind(input.previous, input.current);
  const scoreLine =
    input.current.score === null
      ? "Latest score: unavailable"
      : `Latest score: ${input.current.score}%`;
  const deltaLine = formatDeltaLine(delta);
  const brokenText = brokenLines(broken);

  const footer = input.unsubscribeUrl
    ? `\n\nManage email notifications: ${input.unsubscribeUrl}`
    : "";

  if (kind === "score_alert") {
    const subject = `Listwell alert: ${input.businessName} listing health dropped`;
    const text = `Hi,\n\nYour scheduled Listwell scan for ${input.businessName} found issues worth fixing soon.\n\n${scoreLine}\n${deltaLine}${brokenText}\n\nView the full report: ${input.reportUrl}${footer}`;
    return {
      html: alertHtmlBody(
        input.businessName,
        scoreLine,
        deltaLine,
        broken,
        input.reportUrl,
        input.unsubscribeUrl
      ),
      kind,
      subject,
      text,
    };
  }

  const subject = `Listwell monthly scan: ${input.businessName}`;
  const text = `Hi,\n\nYour monthly Listwell scan for ${input.businessName} is ready.\n\n${scoreLine}\n${deltaLine}${brokenText}\n\nView the report: ${input.reportUrl}${footer}`;
  return {
    html: summaryHtmlBody(
      input.businessName,
      scoreLine,
      deltaLine,
      broken,
      input.reportUrl,
      input.unsubscribeUrl
    ),
    kind,
    subject,
    text,
  };
};
