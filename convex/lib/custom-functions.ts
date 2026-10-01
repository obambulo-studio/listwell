import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";

import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

type AuthUser = Awaited<ReturnType<(typeof authComponent)["getAuthUser"]>>;

const loadAuthedUser = async (
  ctx: QueryCtx | MutationCtx
): Promise<{ user: AuthUser }> => {
  const user = await authComponent.getAuthUser(ctx);
  return { user };
};

const authedQueryCtx = customCtx<QueryCtx, { user: AuthUser }>(loadAuthedUser);
const authedMutationCtx = customCtx<MutationCtx, { user: AuthUser }>(
  loadAuthedUser
);

export const authedQuery = customQuery(query, authedQueryCtx);
export const authedMutation = customMutation(mutation, authedMutationCtx);

export type AuthedUser = AuthUser;
