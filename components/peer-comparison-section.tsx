"use client";

import useSWR from "swr";

import { CheckStatusMark } from "@/components/listwell/report-ui";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "@/lib/chat-onboarding";
import type { CheckStatus } from "@/lib/chat-onboarding";
import {
  PEER_ORDER_CAPTION,
  orderPeerCheckRows,
  peerAuditCaption,
  peerAuditHeading,
  peerAuditJobSchema,
  peerAuditMessage,
} from "@/lib/peers";
import type { PeerAuditJob } from "@/lib/peers";

const POLL_INTERVAL_MS = 2000;

export interface SubjectCheck {
  id: string;
  queued?: boolean;
  title: string;
  value: boolean | null;
}

const startPeerAudit = async (businessId: string): Promise<PeerAuditJob> => {
  const response = await fetch(`/api/businesses/${businessId}/peers`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Nearby comparison failed");
  }
  return peerAuditJobSchema.parse(await response.json());
};

const fetchPeerAudit = async (url: string): Promise<PeerAuditJob> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Nearby comparison failed");
  }
  return peerAuditJobSchema.parse(await response.json());
};

const cellStatus = (value: boolean | null, waiting = false): CheckStatus => {
  if (waiting) {
    return "queued";
  }
  if (value === true) {
    return "pass";
  }
  if (value === false) {
    return "fail";
  }
  return "error";
};

const countLine = (input: {
  fail: number;
  pass: number;
  skipped: number;
}): string =>
  [
    `${input.pass} passing`,
    `${input.fail} need work`,
    input.skipped > 0 ? `${input.skipped} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const ScoreHeading = ({
  name,
  stats,
}: {
  name: string;
  stats: { fail: number; pass: number; score: number; skipped: number };
}) => (
  <span className="flex min-w-24 flex-col gap-0.5">
    <span className="text-ink font-medium">{name}</span>
    <span className="text-ink font-mono text-[11.5px] tabular-nums">
      {stats.score}%
    </span>
    <span className="font-normal">{countLine(stats)}</span>
  </span>
);

const PeerTable = ({
  job,
  subjectChecks,
  subjectName,
}: {
  job: PeerAuditJob;
  subjectChecks: SubjectCheck[];
  subjectName: string;
}) => {
  const rows = orderPeerCheckRows(
    subjectChecks.map((check) => ({
      id: check.id,
      peerValues: job.peers.map((peer) => peer.checks[check.id]?.value ?? null),
      subjectValue: check.queued ? null : check.value,
      subjectWaiting: Boolean(check.queued),
      title: check.title,
    }))
  );
  const counted = visibilityCounts(
    subjectChecks.map((check) => ({
      status: check.queued
        ? "queued"
        : statusFromResult({ queued: false, value: check.value }),
    }))
  );
  const subjectStats = {
    fail: counted.fail,
    pass: counted.pass,
    score: scorePercent(counted),
    skipped: counted.error,
  };

  return (
    <div className="overflow-x-auto">
      <table
        className="listwell-panel__table"
        aria-describedby="peer-comparison-caption"
      >
        <thead>
          <tr>
            <th scope="col" className="align-bottom">
              Check
            </th>
            <th scope="col" className="align-bottom">
              <ScoreHeading name={subjectName} stats={subjectStats} />
            </th>
            {job.peers.map((peer) => (
              <th key={peer.placeId} scope="col" className="align-bottom">
                <ScoreHeading name={peer.name} stats={peer} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className="text-ink min-w-40 font-medium">
                {row.title}
              </th>
              <td>
                <CheckStatusMark
                  status={cellStatus(row.subjectValue, row.subjectWaiting)}
                />
              </td>
              {job.peers.map((peer, index) => (
                <td key={peer.placeId}>
                  <CheckStatusMark
                    status={cellStatus(row.peerValues[index] ?? null)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const usePeerAudit = (
  businessId: string,
  peerAuditOverride?: PeerAuditJob
): {
  error: unknown;
  isLoading: boolean;
  job: PeerAuditJob | undefined;
} => {
  const { data, error, isLoading } = useSWR(
    peerAuditOverride ? null : (["peer-audit", businessId] as const),
    ([, id]) => startPeerAudit(id),
    { revalidateOnFocus: false }
  );
  const started = peerAuditOverride ?? data;
  const polling =
    started && (started.status === "queued" || started.status === "running")
      ? `/api/businesses/${businessId}/peers?jobId=${started.id}`
      : null;
  const { data: polled } = useSWR(polling, fetchPeerAudit, {
    refreshInterval: (latest) => {
      if (
        !latest ||
        latest.status === "queued" ||
        latest.status === "running"
      ) {
        return POLL_INTERVAL_MS;
      }
      return 0;
    },
    refreshWhenHidden: true,
    revalidateOnFocus: false,
  });
  return {
    error,
    isLoading,
    job: peerAuditOverride ?? polled ?? data,
  };
};

export const PeerComparisonSection = ({
  businessId,
  businessName,
  peerAuditOverride,
  subjectChecks,
}: {
  businessId: string;
  businessName: string;
  peerAuditOverride?: PeerAuditJob;
  subjectChecks: SubjectCheck[];
}) => {
  const { error, isLoading, job } = usePeerAudit(businessId, peerAuditOverride);
  const message = job ? peerAuditMessage(job) : null;
  const stillRunning = job?.status === "queued" || job?.status === "running";

  return (
    <section
      className="listwell-panel"
      aria-labelledby="peer-comparison-heading"
    >
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="peer-comparison-heading">
          {job ? peerAuditHeading(job) : "Nearby businesses"}
        </h2>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__note" id="peer-comparison-caption">
          {job ? peerAuditCaption(job) : PEER_ORDER_CAPTION}
        </p>
        {(isLoading && !job) || stillRunning ? (
          <p className="listwell-panel__fine" aria-live="polite">
            Comparing nearby businesses.
          </p>
        ) : null}
        {error && !job ? (
          <p className="listwell-panel__error" role="alert">
            Nearby comparison could not be loaded. Try refreshing the page.
          </p>
        ) : null}
        {message ? <p className="listwell-panel__fine">{message}</p> : null}
      </div>
      {job && job.peers.length > 0 ? (
        <PeerTable
          job={job}
          subjectChecks={subjectChecks}
          subjectName={businessName}
        />
      ) : null}
    </section>
  );
};
