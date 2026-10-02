/** In-app chat audit flow. */
export const LISTWELL_CHAT_PATH = "/chat" as const;

/** Public demo report (Sample Cafe fixture). */
export const SAMPLE_REPORT_PATH = "/example" as const;

export const listwellChatHref = (businessName?: string): string => {
  const trimmed = businessName?.trim();
  if (!trimmed) {
    return LISTWELL_CHAT_PATH;
  }
  const params = new URLSearchParams({ businessName: trimmed });
  return `${LISTWELL_CHAT_PATH}?${params.toString()}`;
};
