import { z } from "zod";

export const otherAccountsStillHaveAccessMessage =
  "Other accounts still have access";

const removalEntitlementSchema = z.object({
  polarSubscriptionId: z.string().nullable(),
  status: z.enum(["active", "revoked"]),
  userId: z.string().nullable(),
});

export type RemovalEntitlement = z.infer<typeof removalEntitlementSchema>;

const removalErrorBodySchema = z.object({
  error: z.string().min(1),
});

/** Active access held by a different account blocks removal. */
export const removalBlockedByOtherActiveEntitlement = (
  entitlements: readonly RemovalEntitlement[],
  ownerId: string
): boolean =>
  entitlements.some(
    (row) =>
      row.status === "active" && row.userId !== null && row.userId !== ownerId
  );

const subscriptionIdToRevoke = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }
  const id = value.trim();
  return id.length > 0 ? id : null;
};

/** Active subscriptions owned by this account, or not assigned to anyone. */
export const subscriptionIdsToRevoke = (
  entitlements: readonly RemovalEntitlement[],
  ownerId: string
): string[] => {
  const ids = new Set<string>();
  for (const row of entitlements) {
    const ownedHere = row.userId === null || row.userId === ownerId;
    const subscriptionId = subscriptionIdToRevoke(row.polarSubscriptionId);
    if (row.status === "active" && ownedHere && subscriptionId !== null) {
      ids.add(subscriptionId);
    }
  }
  return [...ids];
};

/** Another account's entitlement row must stay when this business is removed. */
export const entitlementBelongsToAnotherUser = (
  userId: string | null,
  ownerId: string
): boolean => userId !== null && userId !== ownerId;

export const canRemoveOwnedBusiness = (input: {
  ownerId: string | null;
  sessionUserId: string;
}): boolean => input.ownerId !== null && input.ownerId === input.sessionUserId;

const removalFailureMessage = async (response: Response): Promise<string> => {
  try {
    const parsed = removalErrorBodySchema.safeParse(await response.json());
    if (parsed.success) {
      return parsed.data.error;
    }
  } catch {
    // A missing body still becomes the generic removal error.
  }
  return "Could not remove this business";
};

export const removeOwnedBusiness = async (
  businessId: string
): Promise<void> => {
  const response = await fetch(
    `/api/account/businesses/${encodeURIComponent(businessId)}`,
    { method: "DELETE" }
  );
  if (response.status === 401) {
    throw new Error("Sign in to remove this business");
  }
  if (response.status === 403) {
    throw new Error("You can only remove businesses you own");
  }
  if (response.status === 404) {
    throw new Error("Business not found");
  }
  if (response.status === 409) {
    throw new Error(otherAccountsStillHaveAccessMessage);
  }
  if (!response.ok) {
    throw new Error(await removalFailureMessage(response));
  }
};
