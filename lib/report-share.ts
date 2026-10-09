import { getCloudflareEnv } from "./audit-env";
import { runConvexRead } from "./convex-read";
import {
  api,
  convexMutation,
  convexPublicQuery,
  convexQuery,
} from "./convex/server";
import { BUSINESS_KV_TTL_SECONDS } from "./data";
import {
  createReportShareRequestSchema,
  reportShareRecordSchema,
  reportShareRouteParamsSchema,
  reportShareStateSchema,
} from "./schema";
import type {
  CreateReportShareRequest,
  ReportShareRecord,
  ReportShareRouteParams,
  ReportShareState,
} from "./schema";

const shareTokenKey = (token: string): string => `report-share:token:${token}`;
const shareActiveKey = (businessId: string): string =>
  `report-share:active:${businessId}`;

declare global {
  var listwellReportShares: Map<string, ReportShareRecord> | undefined;
  var listwellActiveShareByBusiness: Map<string, string> | undefined;
}

const shareMemory: Map<string, ReportShareRecord> =
  globalThis.listwellReportShares ?? new Map<string, ReportShareRecord>();
globalThis.listwellReportShares = shareMemory;

const activeShareMemory: Map<string, string> =
  globalThis.listwellActiveShareByBusiness ?? new Map<string, string>();
globalThis.listwellActiveShareByBusiness = activeShareMemory;

const writeShareToMemory = (record: ReportShareRecord): void => {
  shareMemory.set(record.token, record);
  if (record.revokedAt) {
    activeShareMemory.delete(record.businessId);
    return;
  }
  activeShareMemory.set(record.businessId, record.token);
};

const readShareFromMemory = (token: string): ReportShareRecord | null =>
  shareMemory.get(token) ?? null;

const readActiveTokenFromMemory = (businessId: string): string | null =>
  activeShareMemory.get(businessId) ?? null;

const base64UrlFromBytes = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  const base64 = btoa(binary);
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

export const generateReportShareToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
};

/** Invalid tokens (empty, short probes like `init_data`) must not throw during RSC render. */
export const parseReportShareRouteParams = (
  params: unknown
): ReportShareRouteParams | null => {
  const parsed = reportShareRouteParamsSchema.safeParse(params);
  return parsed.success ? parsed.data : null;
};

const parseShareRecord = (raw: unknown): ReportShareRecord | null => {
  const parsed = reportShareRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

const isShareActive = (record: ReportShareRecord, nowMs: number): boolean => {
  if (record.revokedAt) {
    return false;
  }
  if (record.expiresAt) {
    const expiresMs = Date.parse(record.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs <= nowMs) {
      return false;
    }
  }
  return true;
};

const kvTtlForShare = (
  record: ReportShareRecord,
  nowMs: number
): number | undefined => {
  const caps: number[] = [BUSINESS_KV_TTL_SECONDS];
  if (record.expiresAt) {
    const expiresMs = Date.parse(record.expiresAt);
    if (!Number.isNaN(expiresMs)) {
      caps.push(Math.max(60, Math.ceil((expiresMs - nowMs) / 1000)));
    }
  }
  return Math.min(...caps);
};

const writeShareToKv = async (record: ReportShareRecord): Promise<void> => {
  writeShareToMemory(record);
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  if (!kv) {
    return;
  }
  const nowMs = Date.now();
  const ttl = kvTtlForShare(record, nowMs);
  await kv.put(shareTokenKey(record.token), JSON.stringify(record), {
    expirationTtl: ttl,
  });
  if (!record.revokedAt) {
    await kv.put(shareActiveKey(record.businessId), record.token, {
      expirationTtl: ttl,
    });
  }
};

const readShareFromKv = async (
  token: string
): Promise<ReportShareRecord | null> => {
  const fromMemory = readShareFromMemory(token);
  if (fromMemory) {
    return fromMemory;
  }
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  if (!kv) {
    return null;
  }
  const raw = await kv.get(shareTokenKey(token), "json");
  const parsed = parseShareRecord(raw);
  if (parsed) {
    writeShareToMemory(parsed);
  }
  return parsed;
};

const readActiveTokenFromKv = async (
  businessId: string
): Promise<string | null> => {
  const fromMemory = readActiveTokenFromMemory(businessId);
  if (fromMemory) {
    return fromMemory;
  }
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  if (!kv) {
    return null;
  }
  const token = await kv.get(shareActiveKey(businessId), "text");
  return typeof token === "string" && token.length > 0 ? token : null;
};

const revokeShareInKv = async (
  record: ReportShareRecord
): Promise<ReportShareRecord> => {
  const env = await getCloudflareEnv();
  const kv = env?.AUDIT_KV;
  const revoked = reportShareRecordSchema.parse({
    ...record,
    revokedAt: new Date().toISOString(),
  });
  writeShareToMemory(revoked);
  if (kv) {
    const ttl = kvTtlForShare(revoked, Date.now());
    await kv.put(shareTokenKey(revoked.token), JSON.stringify(revoked), {
      expirationTtl: ttl,
    });
    await kv.put(shareActiveKey(revoked.businessId), "", { expirationTtl: 1 });
  }
  return revoked;
};

const syncShareToConvex = async (input: {
  businessExternalId: string;
  expiresAt: string | null;
  token: string;
}): Promise<void> => {
  try {
    await convexMutation(api.reportShares.upsertActive, {
      businessExternalId: input.businessExternalId,
      expiresAt: input.expiresAt,
      token: input.token,
    });
  } catch {
    // KV remains source of truth when Convex is unavailable.
  }
};

const revokeShareInConvex = async (input: {
  businessExternalId: string;
  token: string;
}): Promise<void> => {
  try {
    await convexMutation(api.reportShares.revoke, {
      businessExternalId: input.businessExternalId,
      token: input.token,
    });
  } catch {
    // Best-effort when Convex is unavailable.
  }
};

const readShareFromConvex = async (
  token: string
): Promise<ReportShareRecord | null> => {
  const result = await runConvexRead(() =>
    convexPublicQuery(api.reportShares.getByToken, { token })
  );
  if (result.status === "unavailable" || !result.value) {
    return null;
  }
  return parseShareRecord(result.value);
};

const readActiveShareFromConvex = async (
  businessId: string
): Promise<ReportShareRecord | null> => {
  const result = await runConvexRead(() =>
    convexQuery(api.reportShares.getActiveForBusiness, {
      businessExternalId: businessId,
    })
  );
  if (result.status === "unavailable" || !result.value) {
    return null;
  }
  return parseShareRecord(result.value);
};

export const resolveShareExpiresAt = (
  request: CreateReportShareRequest | undefined
): string | null => {
  const parsed = createReportShareRequestSchema.safeParse(request ?? {});
  if (!parsed.success) {
    throw new Error("Invalid share expiry");
  }
  const days = parsed.data.expiresInDays;
  if (days === null || days === undefined) {
    return null;
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
};

export const getReportShareByToken = async (
  token: string
): Promise<ReportShareRecord | null> => {
  const fromKv = await readShareFromKv(token);
  const fromConvex = fromKv ? null : await readShareFromConvex(token);
  const record = fromKv ?? fromConvex;
  if (record) {
    writeShareToMemory(record);
  }
  if (!record || !isShareActive(record, Date.now())) {
    return null;
  }
  return record;
};

export const getActiveReportShare = async (
  businessId: string
): Promise<ReportShareRecord | null> => {
  const activeToken = await readActiveTokenFromKv(businessId);
  if (activeToken) {
    const fromKv = await readShareFromKv(activeToken);
    if (fromKv && isShareActive(fromKv, Date.now())) {
      return fromKv;
    }
  }
  const fromConvex = await readActiveShareFromConvex(businessId);
  if (fromConvex && isShareActive(fromConvex, Date.now())) {
    return fromConvex;
  }
  return null;
};

const readShareRecordRaw = async (
  token: string
): Promise<ReportShareRecord | null> =>
  readShareFromMemory(token) ??
  (await readShareFromKv(token)) ??
  (await readShareFromConvex(token));

export const revokeReportShare = async (
  businessId: string,
  token?: string
): Promise<ReportShareState> => {
  const active = token
    ? await readShareRecordRaw(token)
    : await getActiveReportShare(businessId);

  if (
    !active ||
    active.businessId !== businessId ||
    !isShareActive(active, Date.now())
  ) {
    return reportShareStateSchema.parse({
      active: false,
      createdAt: null,
      expiresAt: null,
      token: null,
      url: null,
    });
  }

  const revoked = await revokeShareInKv(active);
  await revokeShareInConvex({
    businessExternalId: businessId,
    token: revoked.token,
  });

  return reportShareStateSchema.parse({
    active: false,
    createdAt: revoked.createdAt,
    expiresAt: revoked.expiresAt,
    token: null,
    url: null,
  });
};

export const createReportShare = async (input: {
  businessId: string;
  expiresInDays?: CreateReportShareRequest["expiresInDays"];
  origin: string;
}): Promise<ReportShareState> => {
  const expiresAt = resolveShareExpiresAt({
    expiresInDays: input.expiresInDays,
  });
  const existing = await getActiveReportShare(input.businessId);
  if (existing) {
    await revokeReportShare(input.businessId, existing.token);
  }

  const record = reportShareRecordSchema.parse({
    businessId: input.businessId,
    createdAt: new Date().toISOString(),
    expiresAt,
    revokedAt: null,
    token: generateReportShareToken(),
  });

  await writeShareToKv(record);
  await syncShareToConvex({
    businessExternalId: record.businessId,
    expiresAt: record.expiresAt,
    token: record.token,
  });

  const url = `${input.origin.replace(/\/$/u, "")}/share/${record.token}`;
  return reportShareStateSchema.parse({
    active: true,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    token: record.token,
    url,
  });
};

export const reportShareStateForBusiness = async (
  businessId: string,
  origin: string
): Promise<ReportShareState> => {
  const active = await getActiveReportShare(businessId);
  if (!active) {
    return reportShareStateSchema.parse({
      active: false,
      createdAt: null,
      expiresAt: null,
      token: null,
      url: null,
    });
  }
  const url = `${origin.replace(/\/$/u, "")}/share/${active.token}`;
  return reportShareStateSchema.parse({
    active: true,
    createdAt: active.createdAt,
    expiresAt: active.expiresAt,
    token: active.token,
    url,
  });
};
