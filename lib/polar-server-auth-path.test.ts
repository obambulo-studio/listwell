import { describe, expect, it } from "vitest";

import { betterAuthSendVerificationOtpPath } from "./polar-server";

describe("Better Auth OTP fallback path", () => {
  it("matches the email-otp plugin route", () => {
    expect(betterAuthSendVerificationOtpPath).toBe(
      "/api/auth/email-otp/send-verification-otp"
    );
  });
});
