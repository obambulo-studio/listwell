import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Hourly at :00 UTC so due scans align with calendar hours (see README).
// eslint-disable-next-line @convex-dev/no-top-of-hour-crons -- intentional :00 UTC schedule
crons.hourly("run due monthly scans", { minuteUTC: 0 }, internal.scans.runDue);

export default crons;
