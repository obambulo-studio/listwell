import { z } from "zod";

import { api, convexQuery } from "./convex/server";
import { getResearchEntitlement } from "./data";
import { businessPin } from "./place-pin";
import { convexObservationStore } from "./research-observations";
import { buildResearchView } from "./research-view";
import type { ResearchView } from "./research-view";
import type { ScanEmailResearch } from "./scan-email";
import type { Business } from "./schema";
import {
  researchPeriodStart,
  seoObservationKindSchema,
  seoObservationRowSchema,
} from "./seo-schema";
import type { SeoObservationKind } from "./seo-schema";

const listKind = async (
  businessId: string,
  kind: SeoObservationKind
): Promise<z.infer<typeof seoObservationRowSchema>[]> => {
  const rows = await convexQuery(api.seo.listObservationsByKind, {
    businessExternalId: businessId,
    kind: seoObservationKindSchema.parse(kind),
    limit: 24,
  });
  return z.array(seoObservationRowSchema).parse(rows);
};

/** Reads stored observations. It does not call DataForSEO. */
export const loadResearchView = async (
  business: Business
): Promise<ResearchView | null> => {
  try {
    const entitlement = await getResearchEntitlement(business.id);
    const periodRows = entitlement?.nextScanAt
      ? await convexObservationStore.listForPeriod(
          business.id,
          researchPeriodStart(entitlement.nextScanAt)
        )
      : [];
    const [summaryRows, snapshotRows] = await Promise.all([
      listKind(business.id, "period_summary"),
      listKind(business.id, "competitor_snapshot"),
    ]);
    return buildResearchView({
      periodRows,
      phrases: business.searchPhrases,
      pinId: businessPin(business)?.pinId ?? null,
      snapshotRows,
      summaryRows,
    });
  } catch (error) {
    console.error("loadResearchView failed", error);
    return null;
  }
};

export const loadEmailResearch = async (
  business: Business
): Promise<ScanEmailResearch | null> => {
  const view = await loadResearchView(business);
  const current = view?.periods.at(-1);
  if (!view || !current) {
    return null;
  }
  return {
    competitorNames: view.competitorNames,
    current: current.payload,
    phraseLabels: view.phraseLabels,
    previous: view.periods.at(-2)?.payload ?? null,
  };
};
