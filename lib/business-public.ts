import { businessSchema } from "./schema";
import type { Business } from "./schema";

/** Strip account linkage before showing a report to anonymous viewers. */
export const businessForPublicView = (business: Business): Business =>
  businessSchema.parse({
    ...business,
    userId: null,
  });
