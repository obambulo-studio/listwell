"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckBody } from "@/components/check-body";
import { pointsFor, type CheckDefinition } from "@/lib/checks/types";
import { CHANNEL_CONFIG } from "@/lib/channel";
import { businessToProfiles } from "@/lib/profiles";
import { businessSchema, checkResultSchema, type Business, type CheckResult } from "@/lib/schema";

type CheckStatus = "idle" | "pending" | "pass" | "fail" | "error";

type LiveCheck = {
  definition: CheckDefinition;
  status: CheckStatus;
  result: CheckResult | null;
  duration?: number;
};

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "error":
      return "Error";
    case "pending":
      return "Pending";
    default:
      return "Idle";
  }
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
  const [selectedId, setSelectedId] = useState<string | undefined>(checks[0]?.id);
  const [filter, setFilter] = useState<"failures" | "all">("failures");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await Promise.all(
        checks.map(async (definition) => {
          const start = Date.now();
          try {
            const response = await fetch(`/api/businesses/${business.id}/checks/${definition.id}`);
            const result = checkResultSchema.parse(await response.json());
            if (cancelled) {
              return;
            }
            const status: CheckStatus = result.value === true ? "pass" : result.value === false ? "fail" : "error";
            setLiveChecks((current) =>
              current.map((item) =>
                item.definition.id === definition.id
                  ? { definition, status, result, duration: Date.now() - start }
                  : item,
              ),
            );
          } catch {
            if (cancelled) {
              return;
            }
            setLiveChecks((current) =>
              current.map((item) =>
                item.definition.id === definition.id
                  ? { definition, status: "error", result: { type: "check", value: null, label: "Check failed to run" }, duration: Date.now() - start }
                  : item,
              ),
            );
          }
        }),
      );
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [business.id, checks]);

  const selected = liveChecks.find((item) => item.definition.id === selectedId);

  const channelScores = useMemo(() => {
    const groups = new Map<string, LiveCheck[]>();
    for (const item of liveChecks) {
      const current = groups.get(item.definition.channelCategory) ?? [];
      current.push(item);
      groups.set(item.definition.channelCategory, current);
    }
    return [...groups.entries()].map(([name, items]) => {
      const total = items.reduce((sum, item) => sum + pointsFor(item.definition, business.category), 0);
      const score = items.reduce(
        (sum, item) => sum + (item.status === "pass" ? pointsFor(item.definition, business.category) : 0),
        0,
      );
      const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
      return { name, score, total, percentage };
    });
  }, [business.category, liveChecks]);

  const overall = useMemo(() => {
    const total = liveChecks.reduce((sum, item) => sum + pointsFor(item.definition, business.category), 0);
    const score = liveChecks.reduce(
      (sum, item) => sum + (item.status === "pass" ? pointsFor(item.definition, business.category) : 0),
      0,
    );
    return total > 0 ? Math.round((score / total) * 100) : 0;
  }, [business.category, liveChecks]);

  const visible = liveChecks.filter((item) => {
    if (filter === "all") {
      return true;
    }
    return item.status === "fail" || item.status === "error" || item.status === "pending";
  });

  const profiles = businessToProfiles(business);

  return (
    <>
      <section className="vbg-opening">
        <h1 className="vbg-display">{business.name} is scoring {overall} of 100</h1>
        <p className="vbg-lede">
          Website and listing checks for this {business.category} business. Failures stay first so you can fix what is costing visibility.
        </p>
        <div className="vbg-custom-actions" style={{ marginTop: "24px" }}>
          <Link href={`/${business.id}/edit`}>Edit listings</Link>
        </div>
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Score by channel</h2>
        <div className="vbg-bar-list">
          {channelScores.map((channel) => (
            <div className="vbg-bar" key={`bar-${channel.name}`} style={{ display: "contents" }}>
              <p className="vbg-bar-label">{channel.name}</p>
              <div className="vbg-bar-track">
                <div className="vbg-bar-fill" style={{ width: `${channel.percentage}%` }} />
              </div>
              <p className="vbg-bar-value">{channel.percentage}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Checks</h2>
        <p className="vbg-caption">
          Showing {filter === "failures" ? "failures, errors, and pending checks" : "all checks"}. {visible.length} of {liveChecks.length}.
        </p>
        <div className="vbg-custom-actions" style={{ marginTop: "16px" }}>
          <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setFilter("failures")}>
            Failures first
          </button>
          <button className="vbg-button vbg-button-quiet" type="button" onClick={() => setFilter("all")}>
            All checks
          </button>
        </div>
        <div className="vbg-table-wrap">
          <table>
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
                    <button type="button" onClick={() => setSelectedId(item.definition.id)}>
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
            {selected.result?.label ? ` · ${selected.result.label}` : ""}
          </p>
          <CheckBody markdown={selected.definition.body} />
        </section>
      ) : null}

      <section className="vbg-section">
        <h2 className="vbg-heading-24">Listings on this audit</h2>
        <p className="vbg-caption">
          {profiles.length === 0
            ? "No listings stored yet."
            : `${profiles.length} stored ${profiles.length === 1 ? "listing" : "listings"}.`}
        </p>
        <div className="vbg-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Value</th>
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
