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

export type UseSendConfig = {
  apiKey: string;
  from: string;
  baseUrl?: string;
};

export const readUseSendConfig = (env: {
  USESEND_API_KEY?: string;
  USESEND_FROM?: string;
  USESEND_BASE_URL?: string;
}): UseSendConfig | null => {
  const apiKey = env.USESEND_API_KEY?.trim();
  const from = env.USESEND_FROM?.trim();
  if (!apiKey || !from) {
    return null;
  }
  return {
    apiKey,
    baseUrl: env.USESEND_BASE_URL?.trim() || USESEND_DEFAULT_BASE,
    from,
  };
};

export const sendUseSendEmail = async (
  config: UseSendConfig,
  input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }
): Promise<boolean> => {
  const payload: Record<string, string> = {
    from: config.from,
    subject: input.subject,
    text: input.text,
    to: input.to,
  };
  if (input.html) {
    payload.html = input.html;
  }

  try {
    const response = await fetch(emailsUrl(config.baseUrl ?? USESEND_DEFAULT_BASE), {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      const body = await response.text();
      console.error("sendUseSendEmail: request failed", {
        body,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("sendUseSendEmail: request error", error);
    return false;
  }
};
