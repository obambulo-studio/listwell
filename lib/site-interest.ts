import { z } from "zod";

import { normalizeEmail } from "@/lib/auth";

export const sitePlanInterestSchema = z.enum([
  "one_off_report",
  "monthly_reports",
  "yearly_per_business",
  "not_sure",
]);

export type SitePlanInterest = z.infer<typeof sitePlanInterestSchema>;

export const SITE_PLAN_INTEREST_OPTIONS: readonly {
  label: string;
  value: SitePlanInterest;
}[] = [
  { label: "One-off report (A$9.99)", value: "one_off_report" },
  {
    label: "Monthly reports (A$4.99/mo per business)",
    value: "monthly_reports",
  },
  {
    label: "Yearly (A$49/yr per business)",
    value: "yearly_per_business",
  },
  { label: "Not sure yet", value: "not_sure" },
];

export const sitePlanInterestLabel = (
  value: SitePlanInterest | undefined
): string => {
  if (!value) {
    return "";
  }
  const match = SITE_PLAN_INTEREST_OPTIONS.find(
    (option) => option.value === value
  );
  return match?.label ?? value;
};

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalBusinessCount = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }
    return Number(trimmed);
  }
  return value;
}, z.number().int().min(1).max(10_000).optional());

export const siteInterestInputSchema = z.object({
  businessCount: optionalBusinessCount,
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  name: optionalTrimmedString(120),
  note: optionalTrimmedString(500),
  planInterest: sitePlanInterestSchema.optional(),
});

export type SiteInterestInput = z.infer<typeof siteInterestInputSchema>;

export const siteInterestRecordSchema = z.object({
  businessCount: z.number().int().min(1).max(10_000).optional(),
  createdAt: z.number(),
  email: z.string().email(),
  name: z.string().optional(),
  note: z.string().optional(),
  planInterest: sitePlanInterestSchema.optional(),
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
    businessCount: input.payload.businessCount,
    createdAt: Date.now(),
    email,
    name: input.payload.name,
    note: input.payload.note,
    planInterest: input.payload.planInterest,
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
  const records = rawRecords
    .map((raw) => parseSiteInterestRecord(raw))
    .filter((record): record is SiteInterestRecord => record !== null);
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
  const lines = ["email,name,note,plan_interest,business_count,created_at_iso"];
  for (const record of records) {
    lines.push(
      [
        escapeCsvCell(record.email),
        escapeCsvCell(record.name ?? ""),
        escapeCsvCell(record.note ?? ""),
        escapeCsvCell(sitePlanInterestLabel(record.planInterest)),
        escapeCsvCell(
          record.businessCount === undefined ? "" : String(record.businessCount)
        ),
        escapeCsvCell(new Date(record.createdAt).toISOString()),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
};
