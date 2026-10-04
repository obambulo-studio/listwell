"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useClientHydrated } from "@/components/convex-client-provider";
import { authClient } from "@/lib/auth-client";
import { listwellWordmarkHref } from "@/lib/listwell-routes";

export const ListwellHomeLink = ({
  className,
  children = "Listwell",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  children?: string;
}) => {
  const clientReady = useClientHydrated();
  const session = authClient.useSession();
  const signedIn = clientReady && Boolean(session.data?.user.email);
  const href = listwellWordmarkHref(signedIn);

  return (
    <Link className={className} href={href} {...props}>
      {children}
    </Link>
  );
};
