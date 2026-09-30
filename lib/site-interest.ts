import { z } from "zod";

import { normalizeEmail } from "@/lib/auth";

export const siteInterestInputSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export type SiteInterestInput = z.infer<typeof siteInterestInputSchema>;

export const siteInterestRecordSchema = z.object({
  createdAt: z.number(),
  email: z.string().email(),
  name: z.string().optional(),
  note: z.string().optional(),
});

export type SiteInterestRecord = z.infer<typeof siteInterestRecordSchema>;

const interestKeyPrefix = "site-interest:by-email:";

export const siteInterestKvKey = (email: string): string =>
  `${interestKeyPrefix}${email}`;

export const parseSiteInterestRecord = (
  raw: unknown
): SiteInterestRecord | null => {
  const parsed = siteInterestRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export const saveSiteInterest = async (input: {
  env: CloudflareEnv;
  payload: SiteInterestInput;
}): Promise<{ created: boolean; record: SiteInterestRecord }> => {
  const email = normalizeEmail(input.payload.email);
  if (!email) {
    throw new Error("Invalid email");
  }
  const kv = input.env.AUDIT_KV;
  if (!kv) {
    throw new Error("Interest storage is not configured");
  }

  const key = siteInterestKvKey(email);
  const existingRaw = await kv.get(key, "json");
  const existing = parseSiteInterestRecord(existingRaw);
  if (existing) {
    return { created: false, record: existing };
  }

  const record: SiteInterestRecord = siteInterestRecordSchema.parse({
    createdAt: Date.now(),
    email,
    name: input.payload.name,
    note: input.payload.note,
  });
  await kv.put(key, JSON.stringify(record));
  return { created: true, record };
};

export const listSiteInterests = async (
  env: CloudflareEnv
): Promise<SiteInterestRecord[]> => {
  const kv = env.AUDIT_KV;
  if (!kv) {
    throw new Error("Interest storage is not configured");
  }
  const list = await kv.list({ prefix: interestKeyPrefix });
  const rawRecords = await Promise.all(
    list.keys.map((key) => kv.get(key.name, "json"))
  );
  const records: SiteInterestRecord[] = [];
  for (const raw of rawRecords) {
    const record = parseSiteInterestRecord(raw);
    if (record !== null) {
      records.push(record);
    }
  }
  records.sort((left, right) => right.createdAt - left.createdAt);
  return records;
};

const escapeCsvCell = (value: string): string => {
  if (/[",\n\r]/u.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
};

export const siteInterestsToCsv = (records: SiteInterestRecord[]): string => {
  const lines = ["email,name,note,created_at_iso"];
  for (const record of records) {
    lines.push(
      [
        escapeCsvCell(record.email),
        escapeCsvCell(record.name ?? ""),
        escapeCsvCell(record.note ?? ""),
        escapeCsvCell(new Date(record.createdAt).toISOString()),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
};
