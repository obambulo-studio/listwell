import { z } from "zod";

import { api, convexMutation, convexQuery } from "./convex/server";
import {
  seoObservationRowSchema,
  serializeObservationPayload,
} from "./seo-schema";
import type {
  SeoObservationKind,
  SeoObservationPayloadInput,
  SeoObservationRow,
  SeoObservationStatus,
  SeoSkipReason,
} from "./seo-schema";

export interface ObservationWrite {
  businessExternalId: string;
  costUsdMicros: number;
  kind: SeoObservationKind;
  payloadJson?: string;
  periodStart: string;
  phraseId?: string;
  pinId?: string;
  skipReason?: SeoSkipReason;
  status: SeoObservationStatus;
}

export interface ObservationPatch {
  costUsdMicros?: number;
  observationId: string;
  payloadJson?: string;
  skipReason?: SeoSkipReason;
  status: SeoObservationStatus;
}

export interface ObservationStore {
  listForPeriod: (
    businessExternalId: string,
    periodStart: string
  ) => Promise<SeoObservationRow[]>;
  record: (input: ObservationWrite) => Promise<string>;
  update: (input: ObservationPatch) => Promise<void>;
}

const defined = <Value>(
  key: string,
  value: Value | undefined
): Record<string, Value> => (value === undefined ? {} : { [key]: value });

const observationCostUpdateSchema = z.object({
  previousCostUsdMicros: z.number().int().nonnegative(),
  row: seoObservationRowSchema,
});

const reportDeliveryCost = async (input: {
  businessExternalId: string;
  deltaUsdMicros: number;
  kind: SeoObservationKind;
  observationId: string;
  settledUsdMicros: number;
}): Promise<void> => {
  if (input.deltaUsdMicros <= 0) {
    return;
  }
  try {
    const { reportBusinessDeliveryCost } = await import("./polar-server");
    await reportBusinessDeliveryCost(input);
  } catch (error) {
    console.error("Polar delivery cost ingest failed", {
      businessExternalId: input.businessExternalId,
      error: error instanceof Error ? error.message : "Unknown ingest error",
      observationId: input.observationId,
    });
  }
};

export const convexObservationStore: ObservationStore = {
  listForPeriod: async (businessExternalId, periodStart) => {
    const rows = await convexQuery(api.seo.listObservationsForPeriod, {
      businessExternalId,
      periodStart,
    });
    return z.array(seoObservationRowSchema).parse(rows);
  },
  record: async (input) => {
    const id = await convexMutation(api.seo.recordObservation, {
      businessExternalId: input.businessExternalId,
      costUsdMicros: input.costUsdMicros,
      kind: input.kind,
      periodStart: input.periodStart,
      status: input.status,
      ...defined("payloadJson", input.payloadJson),
      ...defined("phraseId", input.phraseId),
      ...defined("pinId", input.pinId),
      ...defined("skipReason", input.skipReason),
    });
    await reportDeliveryCost({
      businessExternalId: input.businessExternalId,
      deltaUsdMicros: input.costUsdMicros,
      kind: input.kind,
      observationId: id,
      settledUsdMicros: input.costUsdMicros,
    });
    return id;
  },
  update: async (input) => {
    const patch = {
      observationId: input.observationId,
      status: input.status,
      ...defined("costUsdMicros", input.costUsdMicros),
      ...defined("payloadJson", input.payloadJson),
      ...defined("skipReason", input.skipReason),
    };
    if (input.costUsdMicros === undefined) {
      await convexMutation(api.seo.updateObservation, patch);
      return;
    }
    const updated = await convexMutation(api.seo.updateObservation, patch);
    const parsed = observationCostUpdateSchema.safeParse(updated);
    if (!parsed.success) {
      return;
    }
    await reportDeliveryCost({
      businessExternalId: parsed.data.row.businessExternalId,
      deltaUsdMicros: input.costUsdMicros - parsed.data.previousCostUsdMicros,
      kind: parsed.data.row.kind,
      observationId: input.observationId,
      settledUsdMicros: input.costUsdMicros,
    });
  },
};

export const observationPayloadJson = (
  input: SeoObservationPayloadInput
): string => serializeObservationPayload(input);
