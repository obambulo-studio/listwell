import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

export { api } from "../../convex/_generated/api";

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

const internalSecret = (): string => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured");
  }
  return secret;
};

export const convexQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  args: Omit<FunctionArgs<Query>, "secret">
): Promise<FunctionReturnType<Query>> =>
  getConvexClient().query(query, {
    ...args,
    secret: internalSecret(),
  } as FunctionArgs<Query>);

export const convexPublicQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> => getConvexClient().query(query, args);

export const convexMutation = <Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation,
  args: Omit<FunctionArgs<Mutation>, "secret">
): Promise<FunctionReturnType<Mutation>> =>
  getConvexClient().mutation(mutation, {
    ...args,
    secret: internalSecret(),
  } as FunctionArgs<Mutation>);

export const convexAction = <Action extends FunctionReference<"action">>(
  action: Action,
  args: Omit<FunctionArgs<Action>, "secret">
): Promise<FunctionReturnType<Action>> =>
  getConvexClient().action(action, {
    ...args,
    secret: internalSecret(),
  } as FunctionArgs<Action>);
