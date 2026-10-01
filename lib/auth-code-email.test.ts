import { describe, expect, it } from "vitest";

import { renderAuthCodeEmail } from "../emails/auth-code";
import { emailLinkColor } from "../emails/shell";

describe(renderAuthCodeEmail, () => {
  it("renders a sign-in code in the Luma layout", () => {
    const email = renderAuthCodeEmail({
      code: "772602",
      siteUrl: "https://listwell.dev",
    });

    expect({
      hasCode: email.html.includes("772602"),
      hasDomain: email.html.includes("https://listwell.dev"),
      hasIgnore: email.html.includes("ignore this email"),
      hasLede: email.html.includes("is your Listwell sign-in code."),
      hasLinkColor: email.html.includes(emailLinkColor),
      subject: email.subject,
      textHasExpiry: email.text.includes("expires in 5 minutes"),
      textHasHost: email.text.includes("listwell.dev"),
    }).toStrictEqual({
      hasCode: true,
      hasDomain: true,
      hasIgnore: true,
      hasLede: true,
      hasLinkColor: true,
      subject: "772602 is your Listwell sign-in code",
      textHasExpiry: true,
      textHasHost: true,
    });
  });

  it("uses confirm-email copy when the address is changing", () => {
    const email = renderAuthCodeEmail({
      code: "445566",
      siteUrl: "https://listwell.dev/account",
      type: "change-email",
    });

    expect(email.subject).toBe(
      "445566 is your code to confirm this Listwell email"
    );
    expect(email.html).toContain(
      "is your code to confirm this Listwell email."
    );
    expect(email.html).toContain("https://listwell.dev");
  });
});
