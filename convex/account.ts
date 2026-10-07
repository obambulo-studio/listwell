import { v } from "convex/values";

import { attachLastScans, buildPrimaryReports } from "./accountReports";
import { listGuestReportsForUser } from "./businessGuests";
import { authedQuery } from "./lib/customFunctions";
import { accountReportValidator } from "./lib/responseValidators";

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
