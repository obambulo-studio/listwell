"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import type { AuthClient } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

const authClientSchema = z.custom<AuthClient>((value) => {
  if (value === null) {
    return false;
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return false;
  }
  const getSession = Reflect.get(value, "getSession");
  const useSession = Reflect.get(value, "useSession");
  return typeof getSession === "function" && typeof useSession === "function";
});

const resolvedAuthClient = authClientSchema.parse(authClient);

const subscribeClientHydrated =
  (_listener: () => void): (() => void) =>
  () => {
    void _listener;
  };

/** True after the browser has hydrated; false on SSR and the first client pass. */
export const useClientHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeClientHydrated,
    () => true,
    () => false
  );

export const ConvexClientProvider = ({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) => (
  <ConvexBetterAuthProvider
    client={convex}
    authClient={resolvedAuthClient}
    initialToken={initialToken}
  >
    {children}
  </ConvexBetterAuthProvider>
);
