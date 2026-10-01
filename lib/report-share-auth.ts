import { getSessionUser } from "./auth";
import { getBusiness, getBusinessOwnerId } from "./data";
import { getReportAccess } from "./polar-server";

export const canManageReportShare = async (
  businessId: string
): Promise<{ allowed: boolean; reason: "not_found" | "forbidden" | "ok" }> => {
  const business = await getBusiness(businessId);
  if (!business) {
    return { allowed: false, reason: "not_found" };
  }

  const access = await getReportAccess(businessId);
  if (!access.unlocked || access.sessionRequired) {
    return { allowed: false, reason: "forbidden" };
  }

  const [sessionUser, ownerId] = await Promise.all([
    getSessionUser(),
    getBusinessOwnerId(businessId),
  ]);

  if (ownerId && ownerId !== sessionUser?.id) {
    return { allowed: false, reason: "forbidden" };
  }

  return { allowed: true, reason: "ok" };
};
