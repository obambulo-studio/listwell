import { describe, expect, it } from "vitest";

import {
  isUploadedProfilePhotoUrl,
  uploadedProfilePhotoFromSession,
} from "./profile-photo";

describe(isUploadedProfilePhotoUrl, () => {
  it("accepts Convex storage URLs", () => {
    expect(
      isUploadedProfilePhotoUrl(
        "https://acrobatic-donkey-956.convex.cloud/api/storage/abc123"
      )
    ).toBeTruthy();
  });

  it("rejects external HTTPS links", () => {
    expect(
      isUploadedProfilePhotoUrl("https://example.com/photo.jpg")
    ).toBeFalsy();
  });
});

describe(uploadedProfilePhotoFromSession, () => {
  it("ignores legacy link avatars", () => {
    expect(
      uploadedProfilePhotoFromSession("https://example.com/photo.jpg")
    ).toBeNull();
  });

  it("keeps uploaded storage URLs", () => {
    const url = "https://acrobatic-donkey-956.convex.cloud/api/storage/abc123";
    expect(uploadedProfilePhotoFromSession(url)).toBe(url);
  });
});
