"use client";

import { Fragment, useState } from "react";
import useSWR from "swr";
import { z } from "zod";

import { CheckStatusMark } from "@/components/listwell/report-ui";
import { PlaceSearch } from "@/components/place-search";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "@/lib/chat-onboarding";
import type { PlaceCandidate } from "@/lib/discover";
import {
  PEER_ORDER_CAPTION,
  bestNumberIndexes,
  competitorCheckStatus,
  competitorReason,
  formatCountCell,
  formatDistanceCell,
  formatPositionCell,
  formatRatingCell,
  orderPeerCheckRows,
  peerAuditCaption,
  peerAuditHeading,
  peerAuditJobSchema,
  peerAuditMessage,
  whereCompetitorsBeatYou,
} from "@/lib/peers";
import type { PeerAuditJob, PeerColumn } from "@/lib/peers";
import { pickNextFix } from "@/lib/research-report";

const POLL_INTERVAL_MS = 2000;

export interface SubjectCheck {
  id: string;
  label?: string;
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

const competitorErrorSchema = z.object({
  error: z.string(),
});

const metric = (value: number | null | undefined): number | null =>
  typeof value === "number" ? value : null;

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
  reason,
  stats,
}: {
  name: string;
  reason?: string;
  stats: { fail: number; pass: number; score: number; skipped: number };
}) => (
  <span className="flex min-w-24 flex-col gap-0.5">
    <span className="text-ink font-medium">{name}</span>
    {reason ? <span className="font-normal">{reason}</span> : null}
    <span className="text-ink font-mono text-[11.5px] tabular-nums">
      {stats.score}%
    </span>
    <span className="font-normal">{countLine(stats)}</span>
  </span>
);

const CheckCell = ({
  fromSearch = false,
  label,
  value,
  waiting = false,
}: {
  fromSearch?: boolean;
  label?: string;
  value: boolean | null;
  waiting?: boolean;
}) => {
  if (waiting) {
    return <CheckStatusMark status="queued" />;
  }
  const status = competitorCheckStatus(value);
  if (status === "unknown") {
    return (
      <span title={label}>
        <span className="sr-only">
          {label ? `${label}. Unknown` : "Unknown"}
        </span>
        <span aria-hidden="true">Unknown</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <CheckStatusMark status={status} />
      {fromSearch ? <span>From search</span> : null}
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
};

const NumberCell = ({ text }: { text: string }) => (
  <span className="text-ink tabular-nums">{text}</span>
);

const summaryFor = (
  job: PeerAuditJob,
  subjectChecks: SubjectCheck[]
): string[] =>
  whereCompetitorsBeatYou({
    checks: subjectChecks.map((check) => ({
      peerValues: job.peers.map((peer) => peer.checks[check.id]?.value ?? null),
      subjectValue: check.queued ? null : check.value,
      title: check.title,
    })),
    numbers: [
      {
        higherIsBetter: true,
        kind: "rating",
        peers: job.peers.map((peer) => metric(peer.rating)),
        subject: metric(job.subjectFacts?.rating),
      },
      {
        higherIsBetter: true,
        kind: "reviewCount",
        peers: job.peers.map((peer) => metric(peer.reviewCount)),
        subject: metric(job.subjectFacts?.reviewCount),
      },
      {
        higherIsBetter: true,
        kind: "photoCount",
        peers: job.peers.map((peer) => metric(peer.photoCount)),
        subject: metric(job.subjectFacts?.photoCount),
      },
    ],
  });

const PeerActions = ({
  onHide,
  onPin,
  onUnpin,
  peer,
  saving,
}: {
  onHide: (placeId: string) => void;
  onPin: (placeId: string) => void;
  onUnpin: (placeId: string) => void;
  peer: PeerColumn;
  saving: boolean;
}) => (
  <div className="listwell-panel__actions print:hidden">
    {peer.source === "pinned" ? (
      <button
        type="button"
        className="listwell-panel__action"
        disabled={saving}
        onClick={() => onUnpin(peer.placeId)}
      >
        Remove
      </button>
    ) : (
      <>
        <button
          type="button"
          className="listwell-panel__action"
          disabled={saving}
          onClick={() => onPin(peer.placeId)}
        >
          Pin
        </button>
        <button
          type="button"
          className="listwell-panel__action"
          disabled={saving}
          onClick={() => onHide(peer.placeId)}
        >
          Hide
        </button>
      </>
    )}
  </div>
);

const PeerTable = ({
  canManage,
  job,
  onHide,
  onPin,
  onUnpin,
  saving,
  subjectChecks,
  subjectName,
}: {
  canManage: boolean;
  job: PeerAuditJob;
  onHide: (placeId: string) => void;
  onPin: (placeId: string) => void;
  onUnpin: (placeId: string) => void;
  saving: boolean;
  subjectChecks: SubjectCheck[];
  subjectName: string;
}) => {
  const rows = orderPeerCheckRows(
    subjectChecks.map((check) => ({
      id: check.id,
      label: check.label,
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
  const ratingValues = [
    metric(job.subjectFacts?.rating),
    ...job.peers.map((peer) => metric(peer.rating)),
  ];
  const reviewValues = [
    metric(job.subjectFacts?.reviewCount),
    ...job.peers.map((peer) => metric(peer.reviewCount)),
  ];
  const photoValues = [
    metric(job.subjectFacts?.photoCount),
    ...job.peers.map((peer) => metric(peer.photoCount)),
  ];
  const distanceValues = job.peers.map((peer) => metric(peer.distanceMetres));
  const bestRating = new Set(bestNumberIndexes(ratingValues, true));
  const bestReviews = new Set(bestNumberIndexes(reviewValues, true));
  const bestPhotos = new Set(bestNumberIndexes(photoValues, true));
  const bestDistance = new Set(bestNumberIndexes(distanceValues, false));
  const lines = summaryFor(job, subjectChecks);

  return (
    <>
      {lines.length > 0 ? (
        <div className="listwell-panel__body">
          <h3 className="text-ink font-medium">Where they beat you</h3>
          <ul className="flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
                  <ScoreHeading
                    name={peer.name}
                    reason={competitorReason(peer.source, peer.mapPackPhrase)}
                    stats={peer}
                  />
                  {canManage ? (
                    <PeerActions
                      peer={peer}
                      saving={saving}
                      onHide={onHide}
                      onPin={onPin}
                      onUnpin={onUnpin}
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="text-ink min-w-40 font-medium">
                Rating
              </th>
              <td>
                <NumberCell
                  text={formatRatingCell(
                    ratingValues[0] ?? null,
                    bestRating.has(0)
                  )}
                />
              </td>
              {job.peers.map((peer, index) => (
                <td key={peer.placeId}>
                  <NumberCell
                    text={formatRatingCell(
                      metric(peer.rating),
                      bestRating.has(index + 1)
                    )}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="text-ink min-w-40 font-medium">
                Reviews
              </th>
              <td>
                <NumberCell
                  text={formatCountCell(
                    reviewValues[0] ?? null,
                    bestReviews.has(0),
                    "review",
                    "reviews"
                  )}
                />
              </td>
              {job.peers.map((peer, index) => (
                <td key={peer.placeId}>
                  <NumberCell
                    text={formatCountCell(
                      metric(peer.reviewCount),
                      bestReviews.has(index + 1),
                      "review",
                      "reviews"
                    )}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="text-ink min-w-40 font-medium">
                Photos
              </th>
              <td>
                <NumberCell
                  text={formatCountCell(
                    photoValues[0] ?? null,
                    bestPhotos.has(0),
                    "photo",
                    "photos"
                  )}
                />
              </td>
              {job.peers.map((peer, index) => (
                <td key={peer.placeId}>
                  <NumberCell
                    text={formatCountCell(
                      metric(peer.photoCount),
                      bestPhotos.has(index + 1),
                      "photo",
                      "photos"
                    )}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="text-ink min-w-40 font-medium">
                Category
              </th>
              <td>{job.subjectFacts?.primaryCategory ?? "Unknown"}</td>
              {job.peers.map((peer) => (
                <td key={peer.placeId}>{peer.primaryCategory ?? "Unknown"}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="text-ink min-w-40 font-medium">
                Distance
              </th>
              <td>This business</td>
              {job.peers.map((peer, index) => (
                <td key={peer.placeId}>
                  <NumberCell
                    text={formatDistanceCell(
                      metric(peer.distanceMetres),
                      bestDistance.has(index)
                    )}
                  />
                </td>
              ))}
            </tr>
            {(job.phraseRows ?? []).map((phrase) => {
              const cellValues = [
                phrase.subjectCells ?? null,
                ...job.peers.map(
                  (peer) => peer.phraseCells?.[phrase.id] ?? null
                ),
              ];
              const positionValues = [
                phrase.subjectPosition ?? null,
                ...job.peers.map(
                  (peer) => peer.phrasePosition?.[phrase.id] ?? null
                ),
              ];
              const bestCells = new Set(bestNumberIndexes(cellValues, true));
              const bestPosition = new Set(
                bestNumberIndexes(positionValues, false)
              );
              return (
                <Fragment key={phrase.id}>
                  <tr>
                    <th scope="row" className="text-ink min-w-40 font-medium">
                      {`Map pack for '${phrase.text}'`}
                    </th>
                    <td>
                      <NumberCell
                        text={formatCountCell(
                          cellValues[0] ?? null,
                          bestCells.has(0),
                          "cell",
                          "cells"
                        )}
                      />
                    </td>
                    {job.peers.map((peer, index) => (
                      <td key={peer.placeId}>
                        <NumberCell
                          text={formatCountCell(
                            peer.phraseCells?.[phrase.id] ?? null,
                            bestCells.has(index + 1),
                            "cell",
                            "cells"
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className="text-ink min-w-40 font-medium">
                      {`Organic position for '${phrase.text}'`}
                    </th>
                    <td>
                      <NumberCell
                        text={formatPositionCell(
                          positionValues[0] ?? null,
                          bestPosition.has(0)
                        )}
                      />
                    </td>
                    {job.peers.map((peer, index) => (
                      <td key={peer.placeId}>
                        <NumberCell
                          text={formatPositionCell(
                            peer.phrasePosition?.[phrase.id] ?? null,
                            bestPosition.has(index + 1)
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="text-ink min-w-40 font-medium">
                  {row.title}
                </th>
                <td>
                  <CheckCell
                    label={row.label}
                    value={row.subjectValue}
                    waiting={row.subjectWaiting}
                  />
                </td>
                {job.peers.map((peer, index) => (
                  <td key={peer.placeId}>
                    <CheckCell
                      fromSearch={peer.checks[row.id]?.fromSearch === true}
                      label={peer.checks[row.id]?.label}
                      value={row.peerValues[index] ?? null}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export const usePeerAudit = (
  businessId: string,
  peerAuditOverride?: PeerAuditJob
): {
  error: unknown;
  isLoading: boolean;
  job: PeerAuditJob | undefined;
  refresh: () => Promise<PeerAuditJob | undefined>;
} => {
  const { data, error, isLoading, mutate } = useSWR(
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
    refresh: async () => {
      const next = await mutate();
      return next;
    },
  };
};

const updateCompetitors = async (
  businessId: string,
  action: "hide" | "pin" | "unpin",
  placeId: string
): Promise<void> => {
  const response = await fetch(`/api/businesses/${businessId}/competitors`, {
    body: JSON.stringify({ action, placeId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = competitorErrorSchema.safeParse(payload);
    throw new Error(
      parsed.success ? parsed.data.error : "Could not update competitors"
    );
  }
};

export const PeerComparisonSection = ({
  businessId,
  businessName,
  canManageCompetitors = false,
  peerAuditOverride,
  subjectChecks,
}: {
  businessId: string;
  businessName: string;
  canManageCompetitors?: boolean;
  peerAuditOverride?: PeerAuditJob;
  subjectChecks: SubjectCheck[];
}) => {
  const { error, isLoading, job, refresh } = usePeerAudit(
    businessId,
    peerAuditOverride
  );
  const [saving, setSaving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const message = job ? peerAuditMessage(job) : null;
  const stillRunning = job?.status === "queued" || job?.status === "running";
  const canManage = canManageCompetitors && !peerAuditOverride;

  const changeCompetitors = async (
    action: "hide" | "pin" | "unpin",
    placeId: string
  ) => {
    setSaving(true);
    setManageError(null);
    try {
      await updateCompetitors(businessId, action, placeId);
      await refresh();
      setSaving(false);
    } catch (updateError) {
      setManageError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update competitors"
      );
      setSaving(false);
    }
  };

  const pinCandidate = (candidate: PlaceCandidate) => {
    if (candidate.source !== "google") {
      return;
    }
    void changeCompetitors("pin", candidate.id);
  };

  return (
    <section
      className="listwell-panel"
      aria-labelledby="peer-comparison-heading"
    >
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="peer-comparison-heading">
          Competitors
        </h2>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__note" id="peer-comparison-caption">
          {job ? peerAuditCaption(job) : PEER_ORDER_CAPTION}
        </p>
        {job?.placeTypeLabel ? (
          <p className="listwell-panel__fine">{peerAuditHeading(job)}</p>
        ) : null}
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
        {canManage ? (
          <div className="print:hidden">
            <PlaceSearch
              source="google-autocomplete"
              label="Add a competitor"
              onSelect={pinCandidate}
            />
            {manageError ? (
              <p className="listwell-panel__error" role="alert">
                {manageError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {job && job.peers.length > 0 ? (
        <PeerTable
          canManage={canManage}
          job={job}
          saving={saving}
          subjectChecks={subjectChecks}
          subjectName={businessName}
          onHide={(placeId) => {
            void changeCompetitors("hide", placeId);
          }}
          onPin={(placeId) => {
            void changeCompetitors("pin", placeId);
          }}
          onUnpin={(placeId) => {
            void changeCompetitors("unpin", placeId);
          }}
        />
      ) : null}
    </section>
  );
};

export const NextFixSection = ({
  businessId,
  peerAuditOverride,
  subjectChecks,
}: {
  businessId: string;
  peerAuditOverride?: PeerAuditJob;
  subjectChecks: SubjectCheck[];
}) => {
  const { job } = usePeerAudit(businessId, peerAuditOverride);
  const choice = pickNextFix(
    subjectChecks.map((check) => ({
      id: check.id,
      peerValues: job
        ? job.peers.map((peer) => peer.checks[check.id]?.value ?? null)
        : [],
      subjectValue: check.queued ? null : check.value,
      title: check.title,
    }))
  );
  if (!choice) {
    return null;
  }
  const rivalLine =
    choice.competitorPassCount >= 2
      ? `${choice.competitorPassCount} of ${choice.competitorCount} competitors already pass this check.`
      : "This is the first listing check that still needs work.";

  return (
    <section className="listwell-panel" aria-labelledby="next-fix-heading">
      <div className="listwell-panel__head">
        <h2 className="listwell-panel__title" id="next-fix-heading">
          Next fix
        </h2>
      </div>
      <div className="listwell-panel__body">
        <p className="listwell-panel__text">{choice.title}</p>
        <p className="listwell-panel__note">{rivalLine}</p>
      </div>
    </section>
  );
};
