import { z } from "zod";
import { categoryIdSchema } from "./category";

export const locationInputSchema = z.object({
  googlePlaceId: z.string().optional(),
  appleMapsId: z.string().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
});

export const createBusinessRequestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  category: categoryIdSchema,
  websiteUrl: z.string().optional(),
  facebookUsername: z.string().optional(),
  instagramUsername: z.string().optional(),
  tiktokUsername: z.string().optional(),
  xUsername: z.string().optional(),
  linkedinUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
  uberEatsUrl: z.string().optional(),
  doorDashUrl: z.string().optional(),
  deliverooUrl: z.string().optional(),
  menulogUrl: z.string().optional(),
  locations: z.array(locationInputSchema).optional().default([]),
});

export const updateBusinessRequestSchema = createBusinessRequestSchema
  .omit({ id: true })
  .partial()
  .extend({
    locations: z.array(locationInputSchema).optional(),
  });

export const locationSchema = z.object({
  id: z.number(),
  businessId: z.string(),
  googlePlaceId: z.string().nullable(),
  appleMapsId: z.string().nullable(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const businessSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: categoryIdSchema,
  websiteUrl: z.string().nullable(),
  facebookUsername: z.string().nullable(),
  instagramUsername: z.string().nullable(),
  tiktokUsername: z.string().nullable(),
  xUsername: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  uberEatsUrl: z.string().nullable(),
  doorDashUrl: z.string().nullable(),
  deliverooUrl: z.string().nullable(),
  menulogUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  locations: z.array(locationSchema),
});

export type Business = z.infer<typeof businessSchema>;
export type BusinessLocation = z.infer<typeof locationSchema>;
export type CreateBusinessRequest = z.infer<typeof createBusinessRequestSchema>;
export type UpdateBusinessRequest = z.infer<typeof updateBusinessRequestSchema>;

export const checkResultSchema = z.object({
  type: z.literal("check"),
  label: z.string().optional(),
  value: z.boolean().nullable(),
  queued: z.boolean().optional(),
  jobId: z.string().optional(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;

export const checkBatchResponseSchema = z.object({
  results: z.record(z.string(), checkResultSchema),
  pending: z.array(z.string()),
  jobId: z.string().optional(),
});
export type CheckBatchResponse = z.infer<typeof checkBatchResponseSchema>;
