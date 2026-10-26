import { describe, expect, it } from "vitest";

import {
  BUSINESS_EDIT_TOKEN_HEADER,
  businessEditAccess,
  issueBusinessEditToken,
} from "./business-edit-token";
import { BUSINESS_EDIT_TOKEN_HEADER as clientHeader } from "./storage";

describe(businessEditAccess, () => {
  it("uses the same header name as the browser", () => {
    expect(BUSINESS_EDIT_TOKEN_HEADER).toBe(clientHeader);
  });

  it("accepts the issued token and rejects a different one", async () => {
    const businessId = crypto.randomUUID();
    const token = await issueBusinessEditToken(businessId);
    await expect(businessEditAccess(businessId, token)).resolves.toBe("match");
    await expect(
      businessEditAccess(businessId, `${"ab".repeat(32)}`)
    ).resolves.toBe("denied");
    await expect(businessEditAccess(businessId, null)).resolves.toBe("denied");
  });

  it("leaves audits that never received a token editable", async () => {
    await expect(businessEditAccess(crypto.randomUUID(), null)).resolves.toBe(
      "legacy"
    );
  });
});
