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
    return id;
  },
  update: async (input) => {
    await convexMutation(api.seo.updateObservation, {
      observationId: input.observationId,
      status: input.status,
      ...defined("costUsdMicros", input.costUsdMicros),
      ...defined("payloadJson", input.payloadJson),
      ...defined("skipReason", input.skipReason),
    });
  },
};

export const observationPayloadJson = (
  input: SeoObservationPayloadInput
): string => serializeObservationPayload(input);
