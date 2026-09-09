import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("run due monthly scans", { minuteUTC: 0 }, internal.scans.runDue);

export default crons;
