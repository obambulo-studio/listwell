import { z } from "zod";

import type { Id } from "../convex/_generated/dataModel";
import {
  api,
  convexMutation,
  convexPublicQuery,
  convexQuery,
  getConvexClient,
} from "./convex/server";
import {
  businessSchema,
  checkResultSchema,
  createBusinessRequestSchema,
  entitlementKindSchema,
  entitlementRowSchema,
  entitlementStatusSchema,
  scanRowSchema,
  scanStatusSchema,
  scanTriggerSchema,
} from "./schema";
import type {
  Business,
  CreateBusinessRequest,
  EntitlementKind,
  EntitlementRow,
  ScanRow,
  ScanTrigger,
  UpdateBusinessRequest,
  UserRow,
} from "./schema";

export const idListQuerySchema = z.object({
  ids: z.string().optional(),
});

const mapLocations = (locations: CreateBusinessRequest["locations"]) =>
  locations.map((location) => ({
    address: location.address,
    appleMapsId: location.appleMapsId,
    googlePlaceId: location.googlePlaceId,
    name: location.name,
  }));

export const listBusinesses = async (ids: string[]): Promise<Business[]> => {
  const rows = await convexPublicQuery(api.businesses.listByExternalIds, {
    externalIds: ids,
  });
  return z.array(businessSchema).parse(rows);
};

export const getBusiness = async (id: string): Promise<Business | null> => {
  const row = await convexPublicQuery(api.businesses.getByExternalId, {
    externalId: id,
  });
  return row ? businessSchema.parse(row) : null;
};

export const createBusiness = async (
  input: CreateBusinessRequest
): Promise<Business> => {
  const data = createBusinessRequestSchema.parse(input);
  const created = await getConvexClient().mutation(api.businesses.create, {
    category: data.category,
    deliverooUrl: data.deliverooUrl,
    doorDashUrl: data.doorDashUrl,
    externalId: data.id,
    facebookUsername: data.facebookUsername,
    instagramUsername: data.instagramUsername,
    linkedinUrl: data.linkedinUrl,
    locations: mapLocations(data.locations),
    menulogUrl: data.menulogUrl,
    name: data.name,
    tiktokUsername: data.tiktokUsername,
    uberEatsUrl: data.uberEatsUrl,
    websiteUrl: data.websiteUrl,
    xUsername: data.xUsername,
    youtubeUrl: data.youtubeUrl,
  });
  return businessSchema.parse(created);
};

export const updateBusiness = async (
  id: string,
  input: UpdateBusinessRequest
): Promise<Business> => {
  const updated = await convexMutation(api.businesses.update, {
    category: input.category,
    deliverooUrl: input.deliverooUrl,
    doorDashUrl: input.doorDashUrl,
    externalId: id,
    facebookUsername: input.facebookUsername,
    instagramUsername: input.instagramUsername,
    linkedinUrl: input.linkedinUrl,
    locations: input.locations ? mapLocations(input.locations) : undefined,
    menulogUrl: input.menulogUrl,
    name: input.name,
    tiktokUsername: input.tiktokUsername,
    uberEatsUrl: input.uberEatsUrl,
    websiteUrl: input.websiteUrl,
    xUsername: input.xUsername,
    youtubeUrl: input.youtubeUrl,
  });
  return businessSchema.parse(updated);
};

export const getBusinessOwnerId = (
  businessId: string
): Promise<string | null> =>
  convexPublicQuery(api.businesses.getOwnerId, {
    externalId: businessId,
  });

export const claimBusinesses = (
  ids: string[],
  userId: string
): Promise<number> =>
  convexMutation(api.businesses.claimInternal, {
    externalIds: ids,
    userId,
  });

export const hasActiveEntitlement = (businessId: string): Promise<boolean> =>
  convexPublicQuery(api.entitlements.hasActive, {
    businessExternalId: businessId,
  });

export const grantEntitlement = async (input: {
  businessId: string;
  kind: EntitlementKind;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  userId?: string;
}): Promise<EntitlementRow> => {
  const row = await convexMutation(api.entitlements.grant, {
    businessExternalId: input.businessId,
    kind: input.kind,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
    userId: input.userId,
  });
  return entitlementRowSchema.parse({
    ...row,
    kind: entitlementKindSchema.parse(row.kind),
    status: entitlementStatusSchema.parse(row.status),
  });
};

export const revokeEntitlements = async (input: {
  businessId?: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
}): Promise<void> => {
  await convexMutation(api.entitlements.revoke, {
    businessExternalId: input.businessId,
    polarOrderId: input.polarOrderId,
    polarSubscriptionId: input.polarSubscriptionId,
  });
};

export const getActiveEntitlementOwner = async (
  businessId: string
): Promise<{
  unlocked: boolean;
  kind: EntitlementKind | null;
  ownerEmail: string | null;
  ownerUserId: string | null;
}> => {
  const owner = await convexQuery(api.entitlements.getActiveOwner, {
    businessExternalId: businessId,
  });
  return {
    kind: owner.kind ? entitlementKindSchema.parse(owner.kind) : null,
    ownerEmail: owner.ownerEmail,
    ownerUserId: owner.ownerUserId,
    unlocked: owner.unlocked,
  };
};

export const listDueMonthlyEntitlements = async (now: Date, limit: number) => {
  const rows = await convexQuery(api.entitlements.listDueMonthly, {
    limit,
    nowIso: now.toISOString(),
  });
  return z
    .array(
      z.object({
        businessId: z.string(),
        id: z.string(),
        nextScanAt: z.string().nullable(),
      })
    )
    .parse(
      rows.map((row) => ({
        businessId: row.businessExternalId,
        id: row.id,
        nextScanAt: row.nextScanAt,
      }))
    );
};

export const setNextScanAt = async (
  entitlementId: string,
  iso: string
): Promise<void> => {
  await convexMutation(api.entitlements.setNextScanAtInternal, {
    entitlementId: entitlementId as Id<"entitlements">,
    nextScanAt: iso,
  });
};

const parseScanRow = (row: {
  id: string;
  businessId: string;
  trigger: string;
  status: string;
  score: number | null;
  passCount: number;
  failCount: number;
  errorCount: number;
  results: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}): ScanRow => {
  const results =
    row.results && typeof row.results === "object"
      ? z.record(z.string(), checkResultSchema).parse(row.results)
      : null;
  return scanRowSchema.parse({
    ...row,
    results,
    status: scanStatusSchema.parse(row.status),
    trigger: scanTriggerSchema.parse(row.trigger),
  });
};

export const insertScan = async (input: {
  businessId: string;
  trigger: ScanTrigger;
  status: ScanRow["status"];
  startedAt: string;
}): Promise<ScanRow> => {
  const row = await convexMutation(api.scans.insert, {
    businessExternalId: input.businessId,
    startedAt: input.startedAt,
    status: input.status,
    trigger: input.trigger,
  });
  return parseScanRow(row);
};

export const updateScan = async (
  scanId: string,
  patch: Partial<
    Pick<
      ScanRow,
      | "status"
      | "score"
      | "passCount"
      | "failCount"
      | "errorCount"
      | "error"
      | "finishedAt"
    > & {
      results: ScanRow["results"];
    }
  >
): Promise<ScanRow> => {
  const row = await convexMutation(api.scans.update, {
    error: patch.error ?? undefined,
    errorCount: patch.errorCount,
    failCount: patch.failCount,
    finishedAt: patch.finishedAt ?? undefined,
    passCount: patch.passCount,
    resultsJson: patch.results ? JSON.stringify(patch.results) : undefined,
    scanId: scanId as Id<"scans">,
    score: patch.score ?? undefined,
    status: patch.status ?? "running",
  });
  return parseScanRow(row);
};

export const getLatestCompleteScan = (businessId: string) =>
  convexPublicQuery(api.scans.getLatestComplete, {
    businessExternalId: businessId,
  });

export const findUserIdByEmail = (email: string): Promise<string | null> =>
  convexQuery(api.users.findIdByEmail, { email });

export const getUserById = async (id: string): Promise<UserRow | null> => {
  const user = await convexQuery(api.users.getById, { userId: id });
  return user
    ? z
        .object({ createdAt: z.string(), email: z.string(), id: z.string() })
        .parse(user)
    : null;
};

export const listScansForBusiness = (businessId: string, limit = 12) =>
  convexQuery(api.scans.listForBusiness, {
    businessExternalId: businessId,
    limit,
  });

export { nextScanAtFrom } from "./schema";
