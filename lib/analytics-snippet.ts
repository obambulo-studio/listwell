import { z } from "zod";

const businessIdSchema = z.string().min(1);
const ingestKeySchema = z.string().min(16);

export const analyticsScriptSrc = (siteOrigin: string): string => {
  const parsed = z.url().safeParse(siteOrigin.replace(/\/$/u, ""));
  if (!parsed.success) {
    throw new Error("Invalid site origin for analytics snippet");
  }
  const origin = new URL(parsed.data);
  return `${origin.origin}/lw-analytics.js`;
};

export const analyticsInstallSnippet = (input: {
  businessId: string;
  ingestKey: string;
  siteOrigin: string;
}): string => {
  const businessId = businessIdSchema.parse(input.businessId);
  const ingestKey = ingestKeySchema.parse(input.ingestKey);
  const src = analyticsScriptSrc(input.siteOrigin);
  return `<script async defer src="${src}" data-site="${businessId}" data-key="${ingestKey}"></script>`;
};
