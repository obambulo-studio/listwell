import { z } from "zod";

import type { Id } from "../convex/_generated/dataModel";

export const PROFILE_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export const PROFILE_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif" as const;

const profilePhotoMimeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const convexStorageUploadPayloadSchema = z.object({
  storageId: z.string().min(1),
});

const isConvexStorageId = (value: string): value is Id<"_storage"> =>
  /^[\da-z]+$/iu.test(value);

export const parseConvexStorageUploadResponse = (
  payload: unknown
): Id<"_storage"> | null => {
  const parsed = convexStorageUploadPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const { storageId } = parsed.data;
  if (!isConvexStorageId(storageId)) {
    return null;
  }
  return storageId;
};

/** Trimmed Better Auth `user.image`, or null when unset. */
export const storedProfileImageRaw = (
  image: string | null | undefined
): string | null => {
  if (image === null || image === undefined) {
    return null;
  }
  const trimmed = image.trim();
  return trimmed === "" ? null : trimmed;
};

/** Only Convex file uploads count as a custom photo; pasted links do not. */
export const isUploadedProfilePhotoUrl = (value: string): boolean => {
  const parsed = z.url().safeParse(value.trim());
  if (!parsed.success) {
    return false;
  }
  const url = new URL(parsed.data);
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(".convex.cloud") &&
    url.pathname.startsWith("/api/storage/")
  );
};

export const uploadedProfilePhotoFromSession = (
  image: string | null | undefined
): string | null => {
  const raw = storedProfileImageRaw(image);
  if (!raw || !isUploadedProfilePhotoUrl(raw)) {
    return null;
  }
  return raw;
};

export const profilePhotoFileError = (file: File): string | null => {
  const mime = profilePhotoMimeSchema.safeParse(file.type);
  if (!mime.success) {
    return "Choose a JPEG, PNG, WebP, or GIF image";
  }
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    return "Choose an image up to 4 MB";
  }
  if (file.size === 0) {
    return "Choose a non-empty image file";
  }
  return null;
};
