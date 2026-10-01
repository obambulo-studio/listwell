import { z } from "zod";

import {
  formatCheckedDate,
  NOT_RUN_COPY,
  skipReasonCopy,
} from "./research-report";
import {
  aiMentionPayloadSchema,
  backlinksPayloadSchema,
  domainOverviewPayloadSchema,
  gbpPostsQaPayloadSchema,
  keywordMetricsPayloadSchema,
  linkProspectsPayloadSchema,
  organicSerpPayloadSchema,
  periodSummaryPayloadSchema,
  rankGridPayloadSchema,
  readObservationPayload,
  reviewGapPayloadSchema,
  seoObservationRowSchema,
} from "./seo-schema";
import type {
  AiMentionPayload,
  BacklinksPayload,
  CompetitorSnapshotPayload,
  DomainOverviewPayload,
  GbpPostsQaPayload,
  KeywordMetricsPayload,
  LinkProspectsPayload,
  OrganicSerpPayload,
  RankGridPayload,
  ReviewGapPayload,
  SearchPhrase,
  SeoObservationRow,
} from "./seo-schema";

export const researchPeriodSchema = z.object({
  payload: periodSummaryPayloadSchema,
  periodStart: z.string(),
});
export type ResearchPeriod = z.infer<typeof researchPeriodSchema>;

export interface GridCellView {
  index: number;
  places: string[];
  selfRank: number | null;
}

export interface GridView {
  caption: string;
  cells: GridCellView[];
  phrase: string;
  phraseId: string;
}

export interface OrganicList {
  phrase: string;
  phraseId: string;
  results: OrganicSerpPayload["results"];
}

export interface ResearchView {
  aiMentions: AiMentionPayload[];
  aiSkip: string | null;
  backlinks: BacklinksPayload | null;
  backlinksSkip: string | null;
  competitorNames: Record<string, string>;
  currentCompetitorIds: string[];
  domain: DomainOverviewPayload | null;
  domainSkip: string | null;
  grids: GridView[];
  gridSkip: string | null;
  keywords: KeywordMetricsPayload | null;
  keywordSkip: string | null;
  linkProspects: LinkProspectsPayload | null;
  linkProspectsSkip: string | null;
  organic: OrganicList[];
  organicSkip: string | null;
  periods: ResearchPeriod[];
  phraseLabels: Record<string, string>;
  phrases: SearchPhrase[];
  pinId: string | null;
  posts: GbpPostsQaPayload | null;
  postsSkip: string | null;
  reviewGap: ReviewGapPayload | null;
  reviewGapSkip: string | null;
}

const skipLine = (
  rows: readonly SeoObservationRow[],
  kind: SeoObservationRow["kind"]
): string | null => {
  const skipped = rows.find(
    (row) => row.kind === kind && row.status === "skipped" && row.skipReason
  );
  if (!skipped?.skipReason) {
    return null;
  }
  return skipReasonCopy(skipped.skipReason);
};

const completeRows = (
  rows: readonly SeoObservationRow[],
  kind: SeoObservationRow["kind"]
): SeoObservationRow[] =>
  rows.filter((row) => row.kind === kind && row.status === "complete");

const stepSkip = (
  rows: readonly SeoObservationRow[],
  kind: SeoObservationRow["kind"],
  hasPayload: boolean
): string | null => {
  if (hasPayload) {
    return null;
  }
  return skipLine(rows, kind) ?? NOT_RUN_COPY;
};

const payloadOf = <Payload>(
  row: SeoObservationRow,
  schema: z.ZodType<Payload>
): Payload | null => {
  const parsed = readObservationPayload(row);
  if (!parsed) {
    return null;
  }
  const payload = schema.safeParse(parsed.payload);
  return payload.success ? payload.data : null;
};

const byNewest = (rows: readonly SeoObservationRow[]): SeoObservationRow[] =>
  rows.toSorted((left, right) =>
    right.observedAt.localeCompare(left.observedAt)
  );

const newestComplete = <Payload>(
  rows: readonly SeoObservationRow[],
  kind: SeoObservationRow["kind"],
  schema: z.ZodType<Payload>
): Payload | null => {
  const [row] = byNewest(completeRows(rows, kind));
  if (!row) {
    return null;
  }
  return payloadOf(row, schema);
};

const gridView = (grid: RankGridPayload): GridView => ({
  caption: `Checked from 9 points around your pin on ${formatCheckedDate(grid.checkedAt)}.`,
  cells: grid.cells.map((cell) => ({
    index: cell.index,
    places: cell.top.map((place) => place.title),
    selfRank: cell.rank,
  })),
  phrase: grid.phrase,
  phraseId: grid.phraseId,
});

const summariesOldestFirst = (
  rows: readonly SeoObservationRow[]
): ResearchPeriod[] => {
  const seen = new Set<string>();
  const newestFirst: ResearchPeriod[] = [];
  for (const row of byNewest(rows)) {
    if (row.kind !== "period_summary" || row.status !== "complete") {
      continue;
    }
    if (seen.has(row.periodStart)) {
      continue;
    }
    const payload = payloadOf(row, periodSummaryPayloadSchema);
    if (!payload) {
      continue;
    }
    seen.add(row.periodStart);
    newestFirst.push(
      researchPeriodSchema.parse({ payload, periodStart: row.periodStart })
    );
  }
  return newestFirst.toReversed();
};

const namesFromSnapshots = (
  rows: readonly SeoObservationRow[]
): { currentIds: string[]; names: Record<string, string> } => {
  const names: Record<string, string> = {};
  let currentIds: string[] = [];
  const snapshots = byNewest(completeRows(rows, "competitor_snapshot"));
  for (const row of snapshots.toReversed()) {
    const parsed = readObservationPayload(row);
    if (!parsed || parsed.kind !== "competitor_snapshot") {
      continue;
    }
    const payload: CompetitorSnapshotPayload = parsed.payload;
    currentIds = payload.competitors.map((competitor) => competitor.placeId);
    for (const competitor of payload.competitors) {
      names[competitor.placeId] = competitor.name;
    }
  }
  return { currentIds, names };
};

export const buildResearchView = (input: {
  periodRows: readonly SeoObservationRow[];
  phrases: readonly SearchPhrase[];
  pinId: string | null;
  snapshotRows: readonly SeoObservationRow[];
  summaryRows: readonly SeoObservationRow[];
}): ResearchView => {
  const rows = z.array(seoObservationRowSchema).parse(input.periodRows);
  const grids = completeRows(rows, "rank_grid").flatMap((row) => {
    const grid = payloadOf(row, rankGridPayloadSchema);
    return grid ? [gridView(grid)] : [];
  });
  const mentions = completeRows(rows, "ai_mention").flatMap((row) => {
    const mention = payloadOf(row, aiMentionPayloadSchema);
    return mention ? [mention] : [];
  });
  const organic = completeRows(rows, "organic_serp").flatMap((row) => {
    const serp = payloadOf(row, organicSerpPayloadSchema);
    return serp
      ? [
          {
            phrase: serp.phrase,
            phraseId: serp.phraseId,
            results: serp.results,
          },
        ]
      : [];
  });
  const keywords = newestComplete(
    rows,
    "keyword_metrics",
    keywordMetricsPayloadSchema
  );
  const reviewGap = newestComplete(rows, "review_gap", reviewGapPayloadSchema);
  const posts = newestComplete(rows, "gbp_posts_qa", gbpPostsQaPayloadSchema);
  const domain = newestComplete(
    rows,
    "domain_overview",
    domainOverviewPayloadSchema
  );
  const backlinks = newestComplete(rows, "backlinks", backlinksPayloadSchema);
  const prospects = newestComplete(
    rows,
    "link_prospects",
    linkProspectsPayloadSchema
  );
  const names = namesFromSnapshots(
    z.array(seoObservationRowSchema).parse(input.snapshotRows)
  );
  const phraseLabels: Record<string, string> = {};
  for (const phrase of input.phrases) {
    phraseLabels[phrase.id] = phrase.text;
  }
  for (const grid of grids) {
    phraseLabels[grid.phraseId] = grid.phrase;
  }
  for (const list of organic) {
    phraseLabels[list.phraseId] = list.phrase;
  }
  for (const mention of mentions) {
    phraseLabels[mention.phraseId] = mention.phrase;
  }

  return {
    aiMentions: mentions,
    aiSkip: stepSkip(rows, "ai_mention", mentions.length > 0),
    backlinks,
    backlinksSkip: stepSkip(rows, "backlinks", backlinks !== null),
    competitorNames: names.names,
    currentCompetitorIds: names.currentIds,
    domain,
    domainSkip: stepSkip(rows, "domain_overview", domain !== null),
    gridSkip: stepSkip(rows, "rank_grid", grids.length > 0),
    grids,
    keywordSkip: stepSkip(rows, "keyword_metrics", keywords !== null),
    keywords,
    linkProspects: prospects,
    linkProspectsSkip: stepSkip(rows, "link_prospects", prospects !== null),
    organic,
    organicSkip: stepSkip(rows, "organic_serp", organic.length > 0),
    periods: summariesOldestFirst(
      z.array(seoObservationRowSchema).parse(input.summaryRows)
    ),
    phraseLabels,
    phrases: [...input.phrases],
    pinId: input.pinId,
    posts,
    postsSkip: stepSkip(rows, "gbp_posts_qa", posts !== null),
    reviewGap,
    reviewGapSkip: stepSkip(rows, "review_gap", reviewGap !== null),
  };
};
