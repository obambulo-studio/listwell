import { z } from "zod";

const checkResultSchema = z.object({
  jobId: z.string().optional(),
  label: z.string().optional(),
  queued: z.boolean().optional(),
  type: z.literal("check"),
  value: z.boolean().nullable(),
});

const scanResultsRecordSchema = z.record(z.string(), checkResultSchema);

export const parseScanResultsJson = (
  resultsJson: string | undefined
): Record<string, z.infer<typeof checkResultSchema>> | null => {
  if (!resultsJson || resultsJson.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(resultsJson);
  } catch {
    return null;
  }

  const validated = scanResultsRecordSchema.safeParse(parsed);
  if (!validated.success) {
    return null;
  }

  return validated.data;
};
