import type { CategoryId } from "./category";
import { SCORE_DROP_ALERT_POINTS } from "./scan-config";
import {
  checkFixItem,
  failingCheckIds,
  rankFailingChecks,
} from "./scan-email-hints";
import type { CheckFixItem } from "./scan-email-hints";

export interface ScanCheckResult {
  label?: string;
  value: boolean | null;
}

export interface ScanSnapshot {
  results: Record<string, ScanCheckResult> | null;
  score: number | null;
}

export type ScanEmailKind = "monthly_summary" | "score_alert";

export interface ScanEmailContent {
  html: string;
  kind: ScanEmailKind;
  listUnsubscribeUrl: string;
  subject: string;
  text: string;
}

const FONT_STACK =
  "'Geist', 'Geist Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

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

const formatDeltaShort = (delta: number | null): string => {
  if (delta === null) {
    return "No previous score to compare";
  }
  if (delta === 0) {
    return "No change since your last scan";
  }
  if (delta > 0) {
    return `Up ${delta} points since your last scan`;
  }
  return `Down ${Math.abs(delta)} points since your last scan`;
};

const formatDeltaText = (delta: number | null): string => {
  if (delta === null) {
    return "Score change: not enough history to compare yet.";
  }
  if (delta === 0) {
    return "Score change: no change since your last scan.";
  }
  const direction = delta > 0 ? "up" : "down";
  return `Score change: ${direction} ${Math.abs(delta)} points (${delta > 0 ? "+" : ""}${delta}).`;
};

const fixListText = (items: CheckFixItem[]): string => {
  if (items.length === 0) {
    return "";
  }
  const lines = items.map((item) => {
    const hint = item.hint ? ` — ${item.hint}` : "";
    return `- ${item.title}${hint}`;
  });
  return `\n\n${lines.join("\n")}`;
};

const fixListHtml = (
  heading: string,
  items: CheckFixItem[],
  emptyCopy: string
): string => {
  if (items.length === 0) {
    return `<p style="margin:20px 0 0;font-size:15px;line-height:1.5;color:#444">${escapeHtml(emptyCopy)}</p>`;
  }
  const rows = items
    .map((item) => {
      const hint = item.hint
        ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.45;color:#555">${escapeHtml(item.hint)}</p>`
        : "";
      return `<li style="margin:0 0 14px"><strong style="font-size:15px;color:#111">${escapeHtml(item.title)}</strong>${hint}</li>`;
    })
    .join("");
  return `<p style="margin:24px 0 8px;font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;color:#666">${escapeHtml(heading)}</p><ul style="margin:0;padding:0 0 0 18px">${rows}</ul>`;
};

const renderEmailDocument = (input: {
  bodyHtml: string;
  businessName: string;
  preheader: string;
  reportUrl: string;
  score: number | null;
  scoreDelta: number | null;
  unsubscribeUrl: string;
}): string => {
  const scoreDisplay =
    input.score === null
      ? "—"
      : `${input.score}<span style="font-size:28px">%</span>`;
  const deltaLine = formatDeltaShort(input.scoreDelta);
  const reason = `You're receiving this because you have Listwell monthly reports for ${input.businessName}.`;

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Listwell</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:${FONT_STACK};color:#111">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
<tr><td style="padding:20px 28px;border-bottom:1px solid #eee;background:#fafafa">
<span style="font-size:18px;font-weight:600;letter-spacing:-0.02em">Listwell</span>
</td></tr>
<tr><td style="padding:28px">
<div style="text-align:center;margin-bottom:24px">
<div style="font-size:52px;font-weight:700;line-height:1;letter-spacing:-0.03em">${scoreDisplay}</div>
<div style="margin-top:8px;font-size:15px;color:#555">${escapeHtml(deltaLine)}</div>
</div>
${input.bodyHtml}
<p style="margin:28px 0 0;text-align:center">
<a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px">View full report</a>
</p>
</td></tr>
<tr><td style="padding:18px 28px;background:#fafafa;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:#666">
<p style="margin:0 0 8px">${escapeHtml(reason)}</p>
<p style="margin:0"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#444">Email preferences</a> · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#444">Unsubscribe</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

export const buildScanEmail = (input: {
  businessCategory: CategoryId;
  businessName: string;
  current: ScanSnapshot;
  previous: ScanSnapshot | null;
  reportUrl: string;
  unsubscribeUrl: string;
}): ScanEmailContent => {
  if (!input.unsubscribeUrl.trim()) {
    throw new Error("unsubscribeUrl is required for scan emails");
  }

  const delta = scoreDelta(input.previous, input.current);
  const newlyBroken = newlyBrokenChecks(input.previous, input.current);
  const kind = pickScanEmailKind(input.previous, input.current);
  const failing = rankFailingChecks(
    failingCheckIds(input.current),
    input.businessCategory
  );
  const topThree = failing.slice(0, 3).map((id) => checkFixItem(id));
  const alertItems = rankFailingChecks(newlyBroken, input.businessCategory).map(
    (id) => checkFixItem(id)
  );

  const scoreLine =
    input.current.score === null
      ? "Latest score: unavailable"
      : `Latest score: ${input.current.score}%`;
  const deltaLine = formatDeltaText(delta);

  const preferencesFooter = `\n\nEmail preferences: ${input.unsubscribeUrl}`;

  if (kind === "score_alert") {
    const subject = `Listwell alert: ${input.businessName} listing health dropped`;
    const intro =
      "Your scheduled Listwell scan found issues worth fixing soon.";
    const text = `Hi,\n\n${intro}\n\n${scoreLine}\n${deltaLine}${fixListText(alertItems)}\n\nView the full report: ${input.reportUrl}${preferencesFooter}`;
    const bodyHtml = `<p style="margin:0;font-size:16px;line-height:1.55;color:#222">Hi,</p><p style="margin:12px 0 0;font-size:16px;line-height:1.55;color:#222">${escapeHtml(intro)}</p>${fixListHtml("Checks that need attention", alertItems, "No new failing checks since your last scan.")}`;
    return {
      html: renderEmailDocument({
        bodyHtml,
        businessName: input.businessName,
        preheader: `${scoreLine}. ${formatDeltaShort(delta)}.`,
        reportUrl: input.reportUrl,
        score: input.current.score,
        scoreDelta: delta,
        unsubscribeUrl: input.unsubscribeUrl,
      }),
      kind,
      listUnsubscribeUrl: input.unsubscribeUrl,
      subject,
      text,
    };
  }

  const subject = `Listwell monthly scan: ${input.businessName}`;
  const intro = "Your monthly Listwell scan is ready.";
  const topFixHeading = "Top things to fix";
  const emptyFix = "Nothing new to fix — nice work.";
  const text = `Hi,\n\n${intro}\n\n${scoreLine}\n${deltaLine}${
    topThree.length > 0
      ? `\n\n${topFixHeading}:${fixListText(topThree)}`
      : `\n\n${emptyFix}`
  }\n\nView the report: ${input.reportUrl}${preferencesFooter}`;

  const bodyHtml = `<p style="margin:0;font-size:16px;line-height:1.55;color:#222">Hi,</p><p style="margin:12px 0 0;font-size:16px;line-height:1.55;color:#222">${escapeHtml(intro)}</p>${fixListHtml(topFixHeading, topThree, emptyFix)}`;

  return {
    html: renderEmailDocument({
      bodyHtml,
      businessName: input.businessName,
      preheader: `${scoreLine}. ${formatDeltaShort(delta)}.`,
      reportUrl: input.reportUrl,
      score: input.current.score,
      scoreDelta: delta,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
    kind,
    listUnsubscribeUrl: input.unsubscribeUrl,
    subject,
    text,
  };
};
