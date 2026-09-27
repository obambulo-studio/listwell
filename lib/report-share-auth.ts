import { getSessionUser } from "./auth";
import {
  getActiveEntitlementOwner,
  getBusiness,
  getBusinessOwnerId,
} from "./data";

export const canManageReportShare = async (
  businessId: string
): Promise<{ allowed: boolean; reason: "not_found" | "forbidden" | "ok" }> => {
  const business = await getBusiness(businessId);
  if (!business) {
    return { allowed: false, reason: "not_found" };
  }

  const [sessionUser, ownerId, entitlement] = await Promise.all([
    getSessionUser(),
    getBusinessOwnerId(businessId),
    getActiveEntitlementOwner(businessId),
  ]);

  if (ownerId && ownerId !== sessionUser?.id) {
    return { allowed: false, reason: "forbidden" };
  }

  const paidOwnedBySomeoneElse =
    entitlement.backendAvailable &&
    entitlement.unlocked &&
    entitlement.ownerUserId !== null &&
    entitlement.ownerUserId !== sessionUser?.id;

  if (!ownerId && paidOwnedBySomeoneElse) {
    return { allowed: false, reason: "forbidden" };
  }

  return { allowed: true, reason: "ok" };
};
