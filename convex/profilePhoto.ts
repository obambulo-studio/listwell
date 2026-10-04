import { v } from "convex/values";

import { authedMutation } from "./lib/customFunctions";

const PROFILE_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const generateUploadUrl = authedMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
  returns: v.string(),
});

export const finalizeUpload = authedMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) {
      throw new Error("Upload not found");
    }
    const contentType = metadata.contentType ?? "";
    if (!allowedContentTypes.has(contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Unsupported image type");
    }
    if (metadata.size > PROFILE_PHOTO_MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Image is too large");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Could not save your photo");
    }
    return url;
  },
  returns: v.string(),
});
