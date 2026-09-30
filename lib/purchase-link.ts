export const normalizePurchaserEmail = (email?: string): string | undefined => {
  if (!email) {
    return undefined;
  }
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (
    at <= 0 ||
    at !== normalized.lastIndexOf("@") ||
    at === normalized.length - 1 ||
    normalized.includes(" ")
  ) {
    return undefined;
  }
  return normalized;
};

/** An active purchase with no owner, or already owned by this user, can be linked. */
export const activePurchaseLinksToUser = (
  row: {
    status: "active" | "revoked";
    userId?: string;
  },
  userId: string
): boolean =>
  row.status === "active" &&
  (row.userId === undefined || row.userId === userId);
