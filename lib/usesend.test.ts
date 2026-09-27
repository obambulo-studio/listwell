import { describe, expect, it, vi } from "vitest";

import { sendUseSendEmail } from "./usesend";

describe(sendUseSendEmail, () => {
  it("sends List-Unsubscribe headers when provided", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendUseSendEmail(
      { apiKey: "test-key", from: "Listwell <no-reply@listwell.dev>" },
      {
        listUnsubscribeUrl:
          "https://listwell.dev/api/notifications/unsubscribe?token=abc",
        subject: "Test",
        text: "Hello",
        to: "owner@example.com",
      }
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as {
      headers?: Record<string, string>;
    };
    expect(body.headers?.["List-Unsubscribe"]).toBe(
      "<https://listwell.dev/api/notifications/unsubscribe?token=abc>"
    );
    expect(body.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click"
    );

    vi.unstubAllGlobals();
  });
});
