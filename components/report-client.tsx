"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckBody } from "@/components/check-body";
import { pointsFor, type CheckDefinition } from "@/lib/checks/types";
import { CHANNEL_CONFIG } from "@/lib/channel";
import { businessToProfiles } from "@/lib/profiles";
import {
  businessSchema,
  checkBatchResponseSchema,
  checkResultSchema,
  type Business,
  type CheckResult,
} from "@/lib/schema";
import {
  auditSummaryResultSchema,
  buildFallbackSummary,
  completedCheckSchema,
  type AuditSummaryResult,
  type CompletedCheck,
} from "@/lib/summaries";
import { z } from "zod";

type CheckStatus = "idle" | "pending" | "queued" | "pass" | "fail" | "error";

type LiveCheck = {
  definition: CheckDefinition;
  status: CheckStatus;
  result: CheckResult | null;
  duration?: number;
};

function statusFromResult(result: CheckResult): CheckStatus {
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
}

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "error":
      return "Error";
    case "queued":
    case "pending":
      return "Waiting";
    default:
      return "Idle";
  }
}

function completedStatus(status: CheckStatus): CompletedCheck["status"] | null {
  if (status === "pass" || status === "fail" || status === "error") {
    return status;
  }
  return null;
}

function titleForCheck(checks: Array<{ id: string; title: string }>, id: string): string {
  return checks.find((check) => check.id === id)?.title ?? id;
}

function degradedCaption(summary: AuditSummaryResult): string | null {
  if (summary.available) {
    return null;
  }
  return "Listwell wrote this from the completed checks.";
}

function CitationLinks({
  checkIds,
  checks,
  onSelect,
}: {
  checkIds: string[];
  checks: Array<{ id: string; title: string }>;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {checkIds.map((checkId, index) => (
        <span key={checkId}>
          {index > 0 ? ", " : null}
          <button className="vbg-custom-citation" type="button" onClick={() => onSelect(checkId)}>
            {titleForCheck(checks, checkId)}
          </button>
        </span>
      ))}
    </>
  );
}

function detailLabel(item: LiveCheck): string | undefined {
  if (item.status === "queued" || item.status === "pending") {
    return undefined;
  }
  const label = item.result?.label;
  if (!label) {
    return undefined;
  }
  if (label.toLowerCase() === statusLabel(item.status).toLowerCase()) {
    return undefined;
  }
  return label;
}

function recommendedCheckId(summary: AuditSummaryResult | null, liveChecks: LiveCheck[]): string | undefined {
  const cited = summary?.nextActions[0]?.checkIds[0];
  if (cited && liveChecks.some((item) => item.definition.id === cited)) {
    return cited;
  }
  return (
    liveChecks.find((item) => item.status === "fail" || item.status === "error")?.definition.id ??
    liveChecks[0]?.definition.id
  );
}

export function ReportClient({
  initialBusiness,
  checks,
}: {
  initialBusiness: Business;
  checks: CheckDefinition[];
}) {
  const [business] = useState(businessSchema.parse(initialBusiness));
  const [liveChecks, setLiveChecks] = useState<LiveCheck[]>(() =>
    checks.map((definition) => ({ definition, status: "pending", result: null })),
  );
  const [pickedId, setPickedId] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<"failures" | "all">("failures");
  const [summary, setSummary] = useState<AuditSummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function applyResult(checkId: string, result: CheckResult, duration?: number) {
      const status = statusFromResult(result);
      setLiveChecks((current) =>
        current.map((item) =>
          item.definition.id === checkId ? { ...item, status, result, duration } : item,
        ),
      );
    }

    async function pollJob(jobId: string, pendingIds: string[]) {
      const started = Date.now();
      while (!cancelled) {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          break;
        }
        const job: unknown = await response.json();
        if (typeof job !== "object" || job === null || !("status" in job) || !("results" in job)) {
          break;
        }
        const resultsValue = job.results;
        if (typeof resultsValue === "object" && resultsValue !== null) {
          for (const checkId of pendingIds) {
            if (checkId in resultsValue) {
              const parsed = checkResultSchema.safeParse(Reflect.get(resultsValue, checkId));
              if (parsed.success) {
                applyResult(checkId, parsed.data, Date.now() - started);
              }
            }
          }
        }
        if (job.status === "error") {
          for (const checkId of pendingIds) {
            applyResult(checkId, { type: "check", value: null, label: "This check could not run" }, Date.now() - started);
          }
          break;
        }
        if (job.status === "complete") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    async function run() {
      const start = Date.now();
      try {
        const response = await fetch(`/api/businesses/${business.id}/checks`);
        const batch = checkBatchResponseSchema.parse(await response.json());
        if (cancelled) {
          return;
        }
        for (const item of checks) {
          const result = batch.results[item.id];
          if (result) {
            applyResult(item.id, result, Date.now() - start);
          } else if (batch.pending.includes(item.id)) {
            applyResult(item.id, { type: "check", value: null, queued: true, jobId: batch.jobId });
          }
        }
        if (batch.jobId && batch.pending.length > 0) {
          await pollJob(batch.jobId, batch.pending);
        }
      } catch {
        if (cancelled) {
          return;
        }
        await Promise.all(
          checks.map(async (definition) => {
            const checkStart = Date.now();
            try {
              const response = await fetch(`/api/businesses/${business.id}/checks/${definition.id}`);
              const result = checkResultSchema.parse(await response.json());
              if (!cancelled) {
                applyResult(definition.id, result, Date.now() - checkStart);
              }
            } catch {
              if (!cancelled) {
                applyResult(
                  definition.id,
                  { type: "check", value: null, label: "This check could not run" },
                  Date.now() - checkStart,
                );
              }
            }
          }),
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [business.id, checks]);

  const checksFinished =
    liveChecks.length > 0 && liveChecks.every((item) => completedStatus(item.status) !== null);
  const completedSignature = liveChecks
    .map((item) => `${item.definition.id}:${item.status}:${item.result?.label ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!checksFinished) {
      setSummary(null);
      setSummaryLoading(false);
      return;
    }

    const completedChecks = liveChecks.flatMap((item) => {
      const status = completedStatus(item.status);
      if (!status) {
        return [];
      }
      return [
        completedCheckSchema.parse({
          id: item.definition.id,
          title: item.definition.title,
          channelCategory: item.definition.channelCategory,
          status,
          points: pointsFor(item.definition, business.category),
          label: item.result?.label,
        }),
      ];
    });

    let cancelled = false;
    setSummaryLoading(true);

    async function loadSummary() {
      try {
        const response = await fetch(`/api/businesses/${business.id}/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checks: completedChecks }),
        });
        const payload: unknown = await response.json();
        if (!cancelled) {
          setSummary(auditSummaryResultSchema.parse(payload));
        }
      } catch {
        if (!cancelled) {
          setSummary(buildFallbackSummary(z.array(completedCheckSchema).parse(completedChecks), "model_request_failed"));
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [business.category, business.id, checksFinished, completedSignature, liveChecks]);

  const selectedId = pickedId ?? recommendedCheckId(summary, liveChecks);
  const selected = liveChecks.find((item) => item.definition.id === selectedId);
  const selectedDetail = selected ? detailLabel(selected) : undefined;
  const citationChecks = liveChecks.map((item) => ({ id: item.definition.id, title: item.definition.title }));
  const briefCaption = summary ? degradedCaption(summary) : null;

  const visible = liveChecks.filter((item) => {
    if (filter === "all") {
      return true;
    }
    return item.status === "fail" || item.status === "error" || item.status === "pending" || item.status === "queued";
  });

  const profiles = businessToProfiles(business);
  const checksCaption =
    filter === "failures"
      ? `Showing checks that still need attention. ${visible.length} of ${liveChecks.length}.`
      : `Showing all checks. ${visible.length} of ${liveChecks.length}.`;
  const listingsCaption =
    profiles.length === 0
      ? "No listings yet."
      : `${profiles.length} ${profiles.length === 1 ? "listing" : "listings"} on this audit.`;

  return (
    <>
      <section className="vbg-opening">
        <h1 className="vbg-display">{business.name}</h1>
        {checksFinished || summaryLoading || summary ? (
          <>
            <h2 className="vbg-heading-24">What the checks found</h2>
            {summaryLoading && !summary ? (
              <p className="vbg-lede">Listwell is writing the brief from the completed checks.</p>
            ) : null}
            {summary ? (
              <>
                {summary.overview.length > 0 ? (
                  <div className="vbg-reading">
                    {summary.overview.map((claim, index) => (
                      <p key={`${claim.text}-${index}`}>
                        {claim.text}
                        <span className="vbg-caption vbg-custom-citation-line">
                          From{" "}
                          <CitationLinks checkIds={claim.checkIds} checks={citationChecks} onSelect={setPickedId} />
                        </span>
                      </p>
                    ))}
                  </div>
                ) : null}
                {summary.nextActions.length > 0 ? (
                  <ol className="vbg-custom-next-actions">
                    {summary.nextActions.map((action) => (
                      <li key={`${action.priority}-${action.text}`}>
                        <span className="vbg-meta">{action.priority}</span>
                        <div>
                          <p>{action.text}</p>
                          <p className="vbg-caption">
                            From{" "}
                            <CitationLinks checkIds={action.checkIds} checks={citationChecks} onSelect={setPickedId} />
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : summary.overview.length > 0 ? (
                  <p className="vbg-caption">No failed checks to act on.</p>
                ) : null}
                {briefCaption ? <p className="vbg-caption">{briefCaption}</p> : null}
              </>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Checks</h2>
        <div className="vbg-custom-actions">
          <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setFilter("failures")}>
            Failures first
          </button>
          <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setFilter("all")}>
            All checks
          </button>
        </div>
        <div className="vbg-table-wrap">
          <table>
            <caption className="vbg-caption">{checksCaption}</caption>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Channel</th>
                <th scope="col">Status</th>
                <th scope="col" className="vbg-numeric">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.definition.id}
                  className={item.definition.id === selectedId ? "vbg-custom-row-selected" : undefined}
                >
                  <th scope="row">
                    <button type="button" onClick={() => setPickedId(item.definition.id)}>
                      {item.definition.title}
                    </button>
                  </th>
                  <td>{item.definition.channelCategory}</td>
                  <td className={`vbg-custom-status-${item.status}`}>{statusLabel(item.status)}</td>
                  <td className="vbg-numeric">{pointsFor(item.definition, business.category)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="vbg-section">
          <h2 className="vbg-heading-24">{selected.definition.title}</h2>
          <p className="vbg-meta">
            {selected.definition.channelCategory}
            {" · "}
            {pointsFor(selected.definition, business.category)} points
            {" · "}
            {statusLabel(selected.status)}
            {selectedDetail ? ` · ${selectedDetail}` : ""}
          </p>
          <CheckBody markdown={selected.definition.body} />
        </section>
      ) : null}

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Listings on this audit</h2>
        <p className="vbg-meta">
          <Link href={`/${business.id}/edit`}>Edit listings</Link>
        </p>
        <div className="vbg-table-wrap">
          <table>
            <caption className="vbg-caption">{listingsCaption}</caption>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Listing</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={`${profile.type}-${profile.title}`}>
                  <td>{CHANNEL_CONFIG[profile.type].name}</td>
                  <td>
                    {profile.title}
                    {profile.subtitle ? <div className="vbg-meta">{profile.subtitle}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
