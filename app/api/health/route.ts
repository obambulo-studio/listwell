import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuditEngineEnv, lookupProvidersFromEnv } from "@/lib/audit-env";
import { hasAuditKv, probeConvexBusinesses } from "@/lib/data";

export const dynamic = "force-dynamic";

const healthResponseSchema = z.object({
  convex: z.enum(["ok", "error"]),
  lookups: z.object({
    apple: z.boolean(),
    google: z.boolean(),
    osm: z.literal(true),
  }),
  ok: z.boolean(),
  storage: z.object({
    auditKv: z.boolean(),
    d1: z.literal(false),
  }),
});

export const readListwellHealth = async () => {
  const [convex, auditKv, env] = await Promise.all([
    probeConvexBusinesses(),
    hasAuditKv(),
    getAuditEngineEnv(),
  ]);
  const lookups = lookupProvidersFromEnv(env);
  return healthResponseSchema.parse({
    convex,
    lookups,
    ok: auditKv && lookups.osm,
    storage: {
      auditKv,
      d1: false,
    },
  });
};

export const GET = async () =>
  NextResponse.json(await readListwellHealth(), {
    headers: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    },
  });
