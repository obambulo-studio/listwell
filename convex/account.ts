import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import { listGuestReportsForUser } from "./businessGuests";
import { authedQuery } from "./lib/customFunctions";
import { reportEntitlementKind } from "./lib/reportEntitlements";
import { accountReportValidator } from "./lib/responseValidators";

type ReportPlan = "preview" | "once" | "monthly";

interface AccountReportRow {
  id: string;
  lastScan: {
    finishedAt: string | null;
    previousScore: number | null;
    score: number | null;
  } | null;
  name: string;
  nextScanAt: string | null;
  owned: boolean;
  plan: ReportPlan;
  unlocked: boolean;
}

const planFromKind = (
  activeKind: "report_once" | "report_monthly" | null
): ReportPlan => {
  if (activeKind === "report_monthly") {
    return "monthly";
  }
  if (activeKind === "report_once") {
    return "once";
  }
  return "preview";
};

const attachLastScans = async (
  ctx: QueryCtx,
  reports: AccountReportRow[]
): Promise<void> => {
  await Promise.all(
    reports.map(async (report) => {
      const rows = await ctx.db
        .query("scans")
        .withIndex("by_businessExternalId", (q) =>
          q.eq("businessExternalId", report.id)
        )
        .collect();
      const completed = rows
        .filter((row) => row.status === "complete")
        .toSorted((left, right) =>
          (right.finishedAt ?? "").localeCompare(left.finishedAt ?? "")
        );
      const [latest, prior] = completed;
      if (latest) {
        report.lastScan = {
          finishedAt: latest.finishedAt ?? null,
          previousScore: prior?.score ?? null,
          score: latest.score ?? null,
        };
      }
    })
  );
};

const buildPrimaryReports = async (
  ctx: QueryCtx,
  userId: string
): Promise<AccountReportRow[]> => {
  const byExternalId = new Map<string, AccountReportRow>();

  const upsert = (
    business: {
      externalId: string;
      name: string;
    },
    activeKind: "report_once" | "report_monthly" | null,
    nextScanAt: string | null,
    owned: boolean
  ) => {
    const plan = planFromKind(activeKind);
    const existing = byExternalId.get(business.externalId);
    if (!existing) {
      byExternalId.set(business.externalId, {
        id: business.externalId,
        lastScan: null,
        name: business.name,
        nextScanAt: activeKind === "report_monthly" ? nextScanAt : null,
        owned,
        plan,
        unlocked: activeKind !== null,
      });
      return;
    }
    if (owned) {
      existing.owned = true;
    }
    if (activeKind) {
      existing.unlocked = true;
      existing.plan = plan;
      existing.nextScanAt = activeKind === "report_monthly" ? nextScanAt : null;
    }
  };

  const owned = await ctx.db
    .query("businesses")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  for (const business of owned) {
    upsert(business, null, null, true);
  }

  const entitled = await ctx.db
    .query("entitlements")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const entitlementBusinesses = await Promise.all(
    entitled.map(async (entitlement) => {
      const business = await ctx.db
        .query("businesses")
        .withIndex("by_externalId", (q) =>
          q.eq("externalId", entitlement.businessExternalId)
        )
        .unique();
      return { business, entitlement };
    })
  );

  for (const { business, entitlement } of entitlementBusinesses) {
    if (!business) {
      continue;
    }
    const activeKind =
      entitlement.status === "active"
        ? reportEntitlementKind(entitlement.kind)
        : null;
    upsert(
      business,
      activeKind,
      entitlement.status === "active" ? (entitlement.nextScanAt ?? null) : null,
      business.userId === userId
    );
  }

  return [...byExternalId.values()].toSorted((left, right) =>
    right.name.localeCompare(left.name)
  );
};

export const listReports = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const reports = await buildPrimaryReports(ctx, user._id);
    await attachLastScans(ctx, reports);
    return reports;
  },
  returns: v.array(accountReportValidator),
});

export const listAccount = authedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const reports = await buildPrimaryReports(ctx, user._id);
    await attachLastScans(ctx, reports);
    const sharedReports = await listGuestReportsForUser(ctx, user._id);
    await attachLastScans(ctx, sharedReports);
    return { reports, sharedReports };
  },
  returns: v.object({
    reports: v.array(accountReportValidator),
    sharedReports: v.array(accountReportValidator),
  }),
});
