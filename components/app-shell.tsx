"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AccountBackgroundScanHost } from "@/components/account-background-scan-host";
import { Shell } from "@/components/shell";
import { LISTWELL_CHAT_PATH } from "@/lib/listwell-routes";

const isFullHeightChatShell = (pathname: string): boolean =>
  pathname === "/" || pathname === LISTWELL_CHAT_PATH;

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
  return (
    <>
      <AccountBackgroundScanHost />
      <Shell scrollable={!isFullHeightChatShell(pathname)}>{children}</Shell>
    </>
  );
};
