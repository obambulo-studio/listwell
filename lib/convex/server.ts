import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { z } from "zod";

import { getCloudflareEnv } from "@/lib/audit-env";

export { api } from "../../convex/_generated/api";

const optionalSecret = z.string().min(1).optional();

const readSecret = (value: unknown): string | undefined => {
  const parsed = optionalSecret.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

let client: ConvexHttpClient | null = null;

const getConvexUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  }
  return url;
};

export const getConvexClient = (): ConvexHttpClient => {
  if (!client) {
    client = new ConvexHttpClient(getConvexUrl());
  }
  return client;
};

const internalSecret = async (): Promise<string> => {
  const workerEnv = await getCloudflareEnv();
  const secret =
    readSecret(workerEnv?.INTERNAL_API_SECRET) ??
    readSecret(process.env.INTERNAL_API_SECRET);
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured");
  }
  return secret;
};

export const convexQuery = async <Query extends FunctionReference<"query">>(
  query: Query,
  args: Omit<FunctionArgs<Query>, "secret">
): Promise<FunctionReturnType<Query>> => {
  const secret = await internalSecret();
  return getConvexClient().query(query, {
    ...args,
    secret,
  } as FunctionArgs<Query>);
};

export const convexPublicQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> => getConvexClient().query(query, args);

export const convexMutation = async <
  Mutation extends FunctionReference<"mutation">,
>(
  mutation: Mutation,
  args: Omit<FunctionArgs<Mutation>, "secret">
): Promise<FunctionReturnType<Mutation>> => {
  const secret = await internalSecret();
  return getConvexClient().mutation(mutation, {
    ...args,
    secret,
  } as FunctionArgs<Mutation>);
};

export const convexAction = async <Action extends FunctionReference<"action">>(
  action: Action,
  args: Omit<FunctionArgs<Action>, "secret">
): Promise<FunctionReturnType<Action>> => {
  const secret = await internalSecret();
  return getConvexClient().action(action, {
    ...args,
    secret,
  } as FunctionArgs<Action>);
};
