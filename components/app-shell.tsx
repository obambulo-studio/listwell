"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Shell } from "@/components/shell";

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  return <Shell scrollable={pathname !== "/"}>{children}</Shell>;
};
