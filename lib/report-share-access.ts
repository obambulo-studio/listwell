/** Matches `canManageReportShare` for client-side UI (entitlement snapshot only). */
export const canManageReportShareFromAccess = (input: {
  isOwnerView: boolean;
  unlocked: boolean;
  sessionRequired: boolean;
}): boolean => input.isOwnerView && input.unlocked && !input.sessionRequired;
