import { getToken as fetchConvexAuthToken } from "@convex-dev/better-auth/utils";
import type { EmptyObject } from "convex-helpers";
import {
  fetchAction,
  fetchMutation,
  fetchQuery,
  preloadQuery,
} from "convex/nextjs";
import type { Preloaded } from "convex/react";
import type {
  ArgsAndOptions,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import React from "react";
import { z } from "zod";

import { authRequestHeaders } from "@/lib/auth-request-headers";

const convexAuthEnvSchema = z.object({
  convexSiteUrl: z.string().min(1),
  convexUrl: z.string().min(1),
});

const convexAuthEnv = convexAuthEnvSchema.parse({
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
});

const parseConvexSiteUrl = (url: string): string => {
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_SITE_URL is not set. Configure the Convex site URL for Better Auth."
    );
  }
  if (url.endsWith(".convex.cloud")) {
    throw new Error(
      `NEXT_PUBLIC_CONVEX_SITE_URL must use .convex.site (got ${url}).`
    );
  }
  return url;
};

const siteUrl = parseConvexSiteUrl(convexAuthEnv.convexSiteUrl);

const cache =
  React.cache ??
  ((fn: (...args: never[]) => unknown) =>
    (...args: never[]) =>
      fn(...args));

const authHandler = async (request: Request, convexSite: string) => {
  const requestUrl = new URL(request.url);
  const nextUrl = `${convexSite}${requestUrl.pathname}${requestUrl.search}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("transfer-encoding");
  requestHeaders.delete("content-length");
  requestHeaders.delete("connection");
  requestHeaders.set("accept-encoding", "application/json");
  requestHeaders.set("host", new URL(convexSite).host);
  requestHeaders.set("x-forwarded-host", requestUrl.host);
  requestHeaders.set(
    "x-forwarded-proto",
    requestUrl.protocol.replace(/:$/u, "")
  );
  requestHeaders.set("x-better-auth-forwarded-host", requestUrl.host);
  requestHeaders.set(
    "x-better-auth-forwarded-proto",
    requestUrl.protocol.replace(/:$/u, "")
  );

  const init: RequestInit = {
    headers: requestHeaders,
    method: request.method,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  return fetch(nextUrl, init);
};

const nextJsHandler = (convexSite: string) => ({
  GET: (request: Request) => authHandler(request, convexSite),
  POST: (request: Request) => authHandler(request, convexSite),
});

type OptionalArgs<
  FuncRef extends FunctionReference<"query" | "mutation" | "action">,
> = FuncRef["_args"] extends EmptyObject
  ? [args?: EmptyObject]
  : [args: FuncRef["_args"]];

const getArgsAndOptions = <
  FuncRef extends FunctionReference<"query" | "mutation" | "action">,
>(
  args: OptionalArgs<FuncRef>,
  token?: string
): ArgsAndOptions<FuncRef, { token?: string }> => [args[0], { token }];

const cachedGetToken = cache(async (forceRefresh = false) => {
  const requestHeaders = await authRequestHeaders();
  const tokenHeaders = new Headers(requestHeaders);
  return fetchConvexAuthToken(siteUrl, tokenHeaders, { forceRefresh });
});

const isConvexAuthError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("unauthenticated") ||
    message.includes("not authenticated") ||
    message.includes("invalid token")
  );
};

const callWithToken = async <
  FnType extends "query" | "mutation" | "action",
  Fn extends FunctionReference<FnType>,
>(
  fn: (token?: string) => Promise<FunctionReturnType<Fn>>
): Promise<FunctionReturnType<Fn>> => {
  const token = await cachedGetToken();
  try {
    return await fn(token?.token);
  } catch (error) {
    if (!isConvexAuthError(error)) {
      throw error;
    }
    const refreshed = await cachedGetToken(true);
    return fn(refreshed?.token);
  }
};

export const handler = nextJsHandler(siteUrl);

export const getToken = async (): Promise<string | undefined> => {
  const token = await cachedGetToken();
  return token?.token;
};

export const isAuthenticated = async (): Promise<boolean> => {
  const token = await cachedGetToken();
  return Boolean(token?.token);
};

export const preloadAuthQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<Preloaded<Query>> =>
  callWithToken((token?: string) => {
    const argsAndOptions = getArgsAndOptions(args, token);
    return preloadQuery(query, ...argsAndOptions);
  });

export const fetchAuthQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalArgs<Query>
): Promise<FunctionReturnType<Query>> =>
  callWithToken((token?: string) => {
    const argsAndOptions = getArgsAndOptions(args, token);
    return fetchQuery(query, ...argsAndOptions);
  });

export const fetchAuthMutation = <
  Mutation extends FunctionReference<"mutation">,
>(
  mutation: Mutation,
  ...args: OptionalArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> =>
  callWithToken((token?: string) => {
    const argsAndOptions = getArgsAndOptions(args, token);
    return fetchMutation(mutation, ...argsAndOptions);
  });

export const fetchAuthAction = <Action extends FunctionReference<"action">>(
  action: Action,
  ...args: OptionalArgs<Action>
): Promise<FunctionReturnType<Action>> =>
  callWithToken((token?: string) => {
    const argsAndOptions = getArgsAndOptions(args, token);
    return fetchAction(action, ...argsAndOptions);
  });
