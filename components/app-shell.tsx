"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Shell } from "@/components/shell";

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const gatePage = pathname === "/gate";
  if (gatePage) {
    return (
      <div className="listwell-chat-shell bg-page text-ink">
        <main id="main" className="listwell-chat-shell__main">
          {children}
        </main>
      </div>
    );
  }
  return <Shell scrollable={pathname !== "/"}>{children}</Shell>;
};
