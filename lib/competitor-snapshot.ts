import { convexObservationStore } from "./research-observations";
import { pickNextFix } from "./research-report";
import type { NextFixCheck } from "./research-report";
import {
  competitorSnapshotPayloadSchema,
  periodSummaryPayloadSchema,
  readObservationPayload,
  serializeObservationPayload,
} from "./seo-schema";
import type {
  CompetitorSnapshotEntry,
  PeriodSummaryPayload,
  SeoCompetitorSource,
  SeoObservationRow,
} from "./seo-schema";

export interface SnapshotPeer {
  distanceMetres: number | null;
  listingScore: number;
  name: string;
  phraseCells?: Record<string, number>;
  phrasePosition?: Record<string, number>;
  photoCount: number | null;
  placeId: string;
  primaryCategory: string | null;
  rating: number | null;
  reviewCount: number | null;
  source: SeoCompetitorSource;
}

const recordOrEmpty = (
  value: Record<string, number> | undefined
): Record<string, number> => value ?? {};

const sampleFor = (
  rows: readonly SeoObservationRow[],
  placeId: string
): { latestReviewAt: string | null; ownerReplyRate: number | null } | null => {
  for (const row of rows) {
    if (row.kind !== "review_sample" || row.status !== "complete") {
      continue;
    }
    const parsed = readObservationPayload(row);
    if (!parsed || parsed.kind !== "review_sample") {
      continue;
    }
    if (parsed.payload.placeId !== placeId) {
      continue;
    }
    return {
      latestReviewAt: parsed.payload.latestReviewAt,
      ownerReplyRate: parsed.payload.ownerReplyRate,
    };
  }
  return null;
};

export const competitorSnapshotEntries = (input: {
  observations: readonly SeoObservationRow[];
  peers: readonly SnapshotPeer[];
}): CompetitorSnapshotEntry[] =>
  competitorSnapshotPayloadSchema.parse({
    competitors: input.peers.map((peer) => {
      const sample = sampleFor(input.observations, peer.placeId);
      return {
        distanceMetres: peer.distanceMetres,
        latestReviewAt: sample?.latestReviewAt ?? null,
        listingScore: peer.listingScore,
        mapPackCells: recordOrEmpty(peer.phraseCells),
        name: peer.name,
        organicPosition: recordOrEmpty(peer.phrasePosition),
        ownerReplyRate: sample?.ownerReplyRate ?? null,
        photoCount: peer.photoCount,
        placeId: peer.placeId,
        primaryType: peer.primaryCategory,
        rating: peer.rating,
        reviewCount: peer.reviewCount,
        source: peer.source,
      };
    }),
  }).competitors;

const competitorMetrics = (
  entries: readonly CompetitorSnapshotEntry[]
): NonNullable<PeriodSummaryPayload["competitors"]> => {
  const competitors: NonNullable<PeriodSummaryPayload["competitors"]> = {};
  for (const entry of entries) {
    const metrics: NonNullable<PeriodSummaryPayload["competitors"]>[string] =
      {};
    if (entry.listingScore !== null) {
      metrics.listingScore = entry.listingScore;
    }
    if (entry.rating !== null) {
      metrics.rating = entry.rating;
    }
    if (entry.reviewCount !== null) {
      metrics.reviewCount = entry.reviewCount;
    }
    if (Object.keys(entry.mapPackCells).length > 0) {
      metrics.gridTop3Count = entry.mapPackCells;
    }
    if (Object.keys(entry.organicPosition).length > 0) {
      metrics.organicPosition = entry.organicPosition;
    }
    if (Object.keys(metrics).length > 0) {
      competitors[entry.placeId] = metrics;
    }
  }
  return competitors;
};

const writePayload = async (input: {
  businessExternalId: string;
  existing: SeoObservationRow | undefined;
  kind: "competitor_snapshot" | "next_fix" | "period_summary";
  payloadJson: string;
  periodStart: string;
}): Promise<void> => {
  if (input.existing?.payloadJson === input.payloadJson) {
    return;
  }
  await (input.existing
    ? convexObservationStore.update({
        observationId: input.existing.id,
        payloadJson: input.payloadJson,
        status: "complete",
      })
    : convexObservationStore.record({
        businessExternalId: input.businessExternalId,
        costUsdMicros: 0,
        kind: input.kind,
        payloadJson: input.payloadJson,
        periodStart: input.periodStart,
        status: "complete",
      }));
};

/** Writes one snapshot per period, and skips the write when the numbers are unchanged. */
export const persistCompetitorPeriod = async (input: {
  businessExternalId: string;
  nextFixChecks: readonly NextFixCheck[];
  observations: readonly SeoObservationRow[];
  peers: readonly SnapshotPeer[];
  periodStart: string;
}): Promise<void> => {
  const entries = competitorSnapshotEntries(input);
  if (entries.length === 0) {
    return;
  }
  const snapshotJson = serializeObservationPayload({
    kind: "competitor_snapshot",
    payload: { competitors: entries },
  });
  await writePayload({
    businessExternalId: input.businessExternalId,
    existing: input.observations.find(
      (row) => row.kind === "competitor_snapshot"
    ),
    kind: "competitor_snapshot",
    payloadJson: snapshotJson,
    periodStart: input.periodStart,
  });

  const summary = input.observations.find(
    (row) => row.kind === "period_summary" && row.status === "complete"
  );
  const parsed = summary ? readObservationPayload(summary) : null;
  if (parsed?.kind === "period_summary") {
    const payload = periodSummaryPayloadSchema.parse({
      ...parsed.payload,
      competitors: competitorMetrics(entries),
    });
    await writePayload({
      businessExternalId: input.businessExternalId,
      existing: summary,
      kind: "period_summary",
      payloadJson: serializeObservationPayload({
        kind: "period_summary",
        payload,
      }),
      periodStart: input.periodStart,
    });
  }

  const choice = pickNextFix(input.nextFixChecks);
  if (!choice) {
    return;
  }
  await writePayload({
    businessExternalId: input.businessExternalId,
    existing: input.observations.find((row) => row.kind === "next_fix"),
    kind: "next_fix",
    payloadJson: serializeObservationPayload({
      kind: "next_fix",
      payload: {
        checkId: choice.checkId,
        competitorCount: choice.competitorCount,
        competitorPassCount: choice.competitorPassCount,
      },
    }),
    periodStart: input.periodStart,
  });
};
