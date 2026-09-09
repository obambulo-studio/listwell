import { query } from "./_generated/server";
import { authComponent } from "./auth";

type ReportPlan = "preview" | "once" | "monthly";

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

export const listReports = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    const byExternalId = new Map<
      string,
      {
        id: string;
        name: string;
        unlocked: boolean;
        plan: ReportPlan;
        lastScan: { score: number | null; finishedAt: string | null } | null;
        nextScanAt: string | null;
      }
    >();

    const upsert = (
      business: {
        externalId: string;
        name: string;
      },
      activeKind: "report_once" | "report_monthly" | null,
      nextScanAt: string | null
    ) => {
      const plan = planFromKind(activeKind);
      const existing = byExternalId.get(business.externalId);
      if (!existing) {
        byExternalId.set(business.externalId, {
          id: business.externalId,
          lastScan: null,
          name: business.name,
          nextScanAt: activeKind === "report_monthly" ? nextScanAt : null,
          plan,
          unlocked: activeKind !== null,
        });
        return;
      }
      if (activeKind) {
        existing.unlocked = true;
        existing.plan = plan;
        existing.nextScanAt =
          activeKind === "report_monthly" ? nextScanAt : null;
      }
    };

    const owned = await ctx.db
      .query("businesses")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const business of owned) {
      upsert(business, null, null);
    }

    const entitled = await ctx.db
      .query("entitlements")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
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
        entitlement.status === "active" ? entitlement.kind : null;
      upsert(
        business,
        activeKind,
        entitlement.status === "active"
          ? (entitlement.nextScanAt ?? null)
          : null
      );
    }

    const reports = [...byExternalId.values()].toSorted((left, right) =>
      right.name.localeCompare(left.name)
    );

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
        const [latest] = completed;
        if (latest) {
          report.lastScan = {
            finishedAt: latest.finishedAt ?? null,
            score: latest.score ?? null,
          };
        }
      })
    );

    return reports;
  },
});
