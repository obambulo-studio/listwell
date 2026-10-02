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

export interface UseSendConfig {
  apiKey: string;
  baseUrl?: string;
  from: string;
}

export const readUseSendConfig = (env: {
  USESEND_API_KEY?: string;
  USESEND_BASE_URL?: string;
  USESEND_FROM?: string;
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

export interface UseSendAttachment {
  content: string;
  filename: string;
}

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

export const sendUseSendEmail = async (
  config: UseSendConfig,
  input: {
    attachments?: readonly UseSendAttachment[];
    html?: string;
    headers?: Record<string, string>;
    listUnsubscribeUrl?: string;
    subject: string;
    text: string;
    to: string;
  }
): Promise<boolean> => {
  const payload: {
    attachments?: UseSendAttachment[];
    from: string;
    headers?: Record<string, string>;
    html?: string;
    subject: string;
    text: string;
    to: string;
  } = {
    from: config.from,
    subject: input.subject,
    text: input.text,
    to: input.to,
  };
  if (input.attachments && input.attachments.length > 0) {
    payload.attachments = [...input.attachments];
  }
  if (input.html) {
    payload.html = input.html;
  }
  const listUnsubscribe =
    input.listUnsubscribeUrl ?? input.headers?.["List-Unsubscribe"];
  if (listUnsubscribe) {
    const headers: Record<string, string> = {
      ...input.headers,
      "List-Unsubscribe": listUnsubscribe.startsWith("<")
        ? listUnsubscribe
        : `<${listUnsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    payload.headers = headers;
  } else if (input.headers) {
    payload.headers = input.headers;
  }

  try {
    const response = await fetch(
      emailsUrl(config.baseUrl ?? USESEND_DEFAULT_BASE),
      {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
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
