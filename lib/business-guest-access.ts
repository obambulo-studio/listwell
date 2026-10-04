import { getSessionUser } from "./auth";
import { api, convexQuery } from "./convex/server";
import { getBusinessOwnerId } from "./data";

export const isBusinessOwner = async (
  businessId: string,
  userId: string | undefined
): Promise<boolean> => {
  if (!userId) {
    return false;
  }
  const ownerId = await getBusinessOwnerId(businessId);
  return ownerId === userId;
};

export const isActiveBusinessGuest = async (
  businessId: string,
  userId: string
): Promise<boolean> => {
  try {
    return await convexQuery(api.businessGuests.isActiveGuestForUser, {
      businessExternalId: businessId,
      userId,
    });
  } catch {
    return false;
  }
};

export const clearsSessionRequiredForGuest = async (input: {
  businessId: string;
  sessionRequired: boolean;
  sessionUserId: string | null;
}): Promise<boolean> => {
  if (!input.sessionRequired || !input.sessionUserId) {
    return input.sessionRequired;
  }
  const guest = await isActiveBusinessGuest(
    input.businessId,
    input.sessionUserId
  );
  return guest ? false : input.sessionRequired;
};

export const resolveReportViewRole = async (
  businessId: string
): Promise<"owner" | "guest" | "public"> => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return "public";
  }
  if (await isBusinessOwner(businessId, sessionUser.id)) {
    return "owner";
  }
  if (await isActiveBusinessGuest(businessId, sessionUser.id)) {
    return "guest";
  }
  return "public";
};

export const canManageBusinessGuests = async (
  businessId: string
): Promise<boolean> => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return false;
  }
  return isBusinessOwner(businessId, sessionUser.id);
};
