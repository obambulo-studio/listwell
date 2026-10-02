"use client";

import { ChevronDownIcon } from "@hugeicons/core-free-icons";
import { Fragment, useId, useState } from "react";
import type { ReactNode } from "react";
import useSWR from "swr";
import { z } from "zod";

import { Icon } from "@/components/icon";
import { CheckStatusMark } from "@/components/listwell/report-ui";
import { PlaceSearch } from "@/components/place-search";
import {
  scorePercent,
  statusFromResult,
  visibilityCounts,
} from "@/lib/chat-onboarding";
import type { PlaceCandidate } from "@/lib/discover";
import {
  PEER_LIMIT,
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

const peersForList = (job: PeerAuditJob): PeerColumn[] =>
  job.peers.slice(0, PEER_LIMIT);

const ChevronIcon = () => (
  <Icon className="listwell-panel__chevron" icon={ChevronDownIcon} size={15} />
);

const Disclosure = ({
  children,
  id,
  open,
}: {
  children: ReactNode;
  id: string;
  open: boolean;
}) => (
  <div
    className="listwell-disclosure"
    data-open={open ? "true" : "false"}
    id={id}
    inert={open ? undefined : true}
  >
    <div className="listwell-disclosure__clip">{children}</div>
  </div>
);

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
): string[] => {
  const peers = peersForList(job);
  return whereCompetitorsBeatYou({
    checks: subjectChecks.map((check) => ({
      peerValues: peers.map((peer) => peer.checks[check.id]?.value ?? null),
      subjectValue: check.queued ? null : check.value,
      title: check.title,
    })),
    numbers: [
      {
        higherIsBetter: true,
        kind: "rating",
        peers: peers.map((peer) => metric(peer.rating)),
        subject: metric(job.subjectFacts?.rating),
      },
      {
        higherIsBetter: true,
        kind: "reviewCount",
        peers: peers.map((peer) => metric(peer.reviewCount)),
        subject: metric(job.subjectFacts?.reviewCount),
      },
      {
        higherIsBetter: true,
        kind: "photoCount",
        peers: peers.map((peer) => metric(peer.photoCount)),
        subject: metric(job.subjectFacts?.photoCount),
      },
    ],
  });
};

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

const PeerBeatList = ({ lines }: { lines: string[] }) =>
  lines.length > 0 ? (
    <div className="listwell-panel__body">
      <h3 className="text-ink font-medium">Where they beat you</h3>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  ) : null;

interface SubjectStats {
  fail: number;
  pass: number;
  score: number;
  skipped: number;
}

const subjectStatsFor = (subjectChecks: SubjectCheck[]): SubjectStats => {
  const counted = visibilityCounts(
    subjectChecks.map((check) => ({
      status: check.queued
        ? "queued"
        : statusFromResult({ queued: false, value: check.value }),
    }))
  );
  return {
    fail: counted.fail,
    pass: counted.pass,
    score: scorePercent(counted),
    skipped: counted.error,
  };
};

const PeerCompareHead = ({
  canManage,
  onHide,
  onPin,
  onUnpin,
  peer,
  saving,
  subjectName,
  subjectStats,
}: {
  canManage: boolean;
  onHide: (placeId: string) => void;
  onPin: (placeId: string) => void;
  onUnpin: (placeId: string) => void;
  peer: PeerColumn;
  saving: boolean;
  subjectName: string;
  subjectStats: SubjectStats;
}) => (
  <thead>
    <tr>
      <th scope="col" className="align-bottom">
        Check
      </th>
      <th scope="col" className="align-bottom">
        <ScoreHeading name={subjectName} stats={subjectStats} />
      </th>
      <th scope="col" className="align-bottom">
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
    </tr>
  </thead>
);

const PeerFactRows = ({
  job,
  peer,
}: {
  job: PeerAuditJob;
  peer: PeerColumn;
}) => {
  const ratingValues = [metric(job.subjectFacts?.rating), metric(peer.rating)];
  const reviewValues = [
    metric(job.subjectFacts?.reviewCount),
    metric(peer.reviewCount),
  ];
  const photoValues = [
    metric(job.subjectFacts?.photoCount),
    metric(peer.photoCount),
  ];
  const bestRating = new Set(bestNumberIndexes(ratingValues, true));
  const bestReviews = new Set(bestNumberIndexes(reviewValues, true));
  const bestPhotos = new Set(bestNumberIndexes(photoValues, true));

  return (
    <>
      <tr>
        <th scope="row" className="text-ink min-w-40 font-medium">
          Rating
        </th>
        <td>
          <NumberCell
            text={formatRatingCell(ratingValues[0] ?? null, bestRating.has(0))}
          />
        </td>
        <td>
          <NumberCell
            text={formatRatingCell(ratingValues[1] ?? null, bestRating.has(1))}
          />
        </td>
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
        <td>
          <NumberCell
            text={formatCountCell(
              reviewValues[1] ?? null,
              bestReviews.has(1),
              "review",
              "reviews"
            )}
          />
        </td>
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
        <td>
          <NumberCell
            text={formatCountCell(
              photoValues[1] ?? null,
              bestPhotos.has(1),
              "photo",
              "photos"
            )}
          />
        </td>
      </tr>
      <tr>
        <th scope="row" className="text-ink min-w-40 font-medium">
          Category
        </th>
        <td>{job.subjectFacts?.primaryCategory ?? "Unknown"}</td>
        <td>{peer.primaryCategory ?? "Unknown"}</td>
      </tr>
      <tr>
        <th scope="row" className="text-ink min-w-40 font-medium">
          Distance
        </th>
        <td>This business</td>
        <td>
          <NumberCell
            text={formatDistanceCell(metric(peer.distanceMetres), false)}
          />
        </td>
      </tr>
    </>
  );
};

interface PeerTableCheck {
  id: string;
  label?: string;
  peerValues: (boolean | null)[];
  subjectValue: boolean | null;
  subjectWaiting: boolean;
  title: string;
}

const PeerPhraseRows = ({
  job,
  peer,
}: {
  job: PeerAuditJob;
  peer: PeerColumn;
}) => (
  <>
    {(job.phraseRows ?? []).map((phrase) => {
      const cellValues = [
        phrase.subjectCells ?? null,
        peer.phraseCells?.[phrase.id] ?? null,
      ];
      const positionValues = [
        phrase.subjectPosition ?? null,
        peer.phrasePosition?.[phrase.id] ?? null,
      ];
      const bestCells = new Set(bestNumberIndexes(cellValues, true));
      const bestPosition = new Set(bestNumberIndexes(positionValues, false));
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
            <td>
              <NumberCell
                text={formatCountCell(
                  cellValues[1] ?? null,
                  bestCells.has(1),
                  "cell",
                  "cells"
                )}
              />
            </td>
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
            <td>
              <NumberCell
                text={formatPositionCell(
                  positionValues[1] ?? null,
                  bestPosition.has(1)
                )}
              />
            </td>
          </tr>
        </Fragment>
      );
    })}
  </>
);

const PeerCheckRows = ({
  peer,
  rows,
}: {
  peer: PeerColumn;
  rows: PeerTableCheck[];
}) => (
  <>
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
        <td>
          <CheckCell
            fromSearch={peer.checks[row.id]?.fromSearch === true}
            label={peer.checks[row.id]?.label}
            value={row.peerValues[0] ?? null}
          />
        </td>
      </tr>
    ))}
  </>
);

const rowsForPeer = (
  subjectChecks: SubjectCheck[],
  peer: PeerColumn
): PeerTableCheck[] =>
  orderPeerCheckRows(
    subjectChecks.map((check) => ({
      id: check.id,
      label: check.label,
      peerValues: [peer.checks[check.id]?.value ?? null],
      subjectValue: check.queued ? null : check.value,
      subjectWaiting: Boolean(check.queued),
      title: check.title,
    }))
  );

const PeerCompare = ({
  canManage,
  job,
  onHide,
  onPin,
  onUnpin,
  peer,
  saving,
  subjectChecks,
  subjectName,
  subjectStats,
}: {
  canManage: boolean;
  job: PeerAuditJob;
  onHide: (placeId: string) => void;
  onPin: (placeId: string) => void;
  onUnpin: (placeId: string) => void;
  peer: PeerColumn;
  saving: boolean;
  subjectChecks: SubjectCheck[];
  subjectName: string;
  subjectStats: SubjectStats;
}) => (
  <div className="listwell-panel__detail listwell-panel__detail--compare">
    <div className="overflow-x-auto">
      <table className="listwell-panel__table">
        <caption className="sr-only">
          {`How ${peer.name} compares with ${subjectName}`}
        </caption>
        <PeerCompareHead
          canManage={canManage}
          peer={peer}
          saving={saving}
          subjectName={subjectName}
          subjectStats={subjectStats}
          onHide={onHide}
          onPin={onPin}
          onUnpin={onUnpin}
        />
        <tbody>
          <PeerFactRows job={job} peer={peer} />
          <PeerPhraseRows job={job} peer={peer} />
          <PeerCheckRows peer={peer} rows={rowsForPeer(subjectChecks, peer)} />
        </tbody>
      </table>
    </div>
  </div>
);

const PeerList = ({
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
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);
  const listId = useId();
  const peers = peersForList(job);
  const subjectStats = subjectStatsFor(subjectChecks);
  const lines = summaryFor(job, subjectChecks);

  const togglePeer = (placeId: string) => {
    setOpenPlaceId((current) => (current === placeId ? null : placeId));
  };

  return (
    <>
      <PeerBeatList lines={lines} />
      <ul className="listwell-panel__rows">
        {peers.map((peer, index) => {
          const open = openPlaceId === peer.placeId;
          const panelId = `${listId}-peer-${index}`;
          return (
            <li key={peer.placeId}>
              <button
                type="button"
                className="listwell-panel__row"
                aria-controls={panelId}
                aria-expanded={open}
                onClick={() => togglePeer(peer.placeId)}
              >
                <span className="listwell-panel__row-main">
                  <span className="listwell-panel__row-title">{peer.name}</span>
                </span>
                <span className="listwell-panel__mono">{`${peer.score}%`}</span>
                <ChevronIcon />
              </button>
              <Disclosure id={panelId} open={open}>
                <PeerCompare
                  canManage={canManage}
                  job={job}
                  peer={peer}
                  saving={saving}
                  subjectChecks={subjectChecks}
                  subjectName={subjectName}
                  subjectStats={subjectStats}
                  onHide={onHide}
                  onPin={onPin}
                  onUnpin={onUnpin}
                />
              </Disclosure>
            </li>
          );
        })}
      </ul>
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
      {job && peersForList(job).length > 0 ? (
        <PeerList
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
  const peers = job ? peersForList(job) : [];
  const choice = pickNextFix(
    subjectChecks.map((check) => ({
      id: check.id,
      peerValues: peers.map((peer) => peer.checks[check.id]?.value ?? null),
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
