/** In-app chat audit flow (localStorage session restore targets this path). */
export const LISTWELL_CHAT_PATH = "/chat" as const;

export const listwellChatHref = (businessName?: string): string => {
  const trimmed = businessName?.trim();
  if (!trimmed) {
    return LISTWELL_CHAT_PATH;
  }
  const params = new URLSearchParams({ businessName: trimmed });
  return `${LISTWELL_CHAT_PATH}?${params.toString()}`;
};
