import { z } from "zod";
import { getCloudflareEnv } from "./audit-env";

export const reportSummaryInputSchema = z.object({
  businessName: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      value: z.boolean().nullable(),
      label: z.string().optional(),
    }),
  ),
});

export type ReportSummaryInput = z.infer<typeof reportSummaryInputSchema>;

export const reportSummarySchema = z.object({
  text: z.string(),
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;

/**
 * LIST-3 hook. The Workers AI binding (`AI` in wrangler.jsonc) is wired here
 * so the brief ticket can call `env.AI.run` without inventing a second path.
 * This ticket does not generate summaries.
 */
export async function summarizeReport(input: ReportSummaryInput): Promise<ReportSummary | null> {
  reportSummaryInputSchema.parse(input);
  const env = await getCloudflareEnv();
  if (!env?.AI) {
    return null;
  }
  return null;
}
