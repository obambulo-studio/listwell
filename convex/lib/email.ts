const USESEND_DEFAULT_BASE = "https://app.usesend.com";

const emailsUrl = (base: string): string => {
  const trimmed = base.replace(/\/$/u, "");
  if (trimmed.endsWith("/api/v1/emails")) {
    return trimmed;
  }
  if (trimmed.endsWith("/api/v1")) {
    return `${trimmed}/emails`;
  }
  return `${trimmed}/api/v1/emails`;
};

export const sendSignInCode = async (
  to: string,
  code: string
): Promise<boolean> => {
  const apiKey = process.env.USESEND_API_KEY;
  const from = process.env.USESEND_FROM;
  if (!apiKey || !from) {
    console.error(
      "sendSignInCode: USESEND_API_KEY or USESEND_FROM is not configured on Convex"
    );
    return false;
  }

  const baseUrl = process.env.USESEND_BASE_URL ?? USESEND_DEFAULT_BASE;
  const payload = {
    from,
    subject: "Your Listwell sign-in code",
    text: `Your sign-in code is ${code}.\n\nThis code expires in 10 minutes.`,
    to,
  };

  try {
    const response = await fetch(emailsUrl(baseUrl), {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("sendSignInCode: UseSend request failed", {
        body,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("sendSignInCode: UseSend request error", error);
    return false;
  }
};
