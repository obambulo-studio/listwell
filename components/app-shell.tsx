"use client";

import { usePathname } from "next/navigation";
import { lazy, Suspense, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { Shell } from "@/components/shell";
import {
  activeAccountBackgroundScanName,
  LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
} from "@/lib/chat-session-keys";
import { LISTWELL_CHAT_PATH } from "@/lib/listwell-routes";

// The chat app (and the check catalog it imports) only loads when a scan is
// already running in this tab. Other pages, including /how-it-works, do not
// download it.
const AccountBackgroundScanHost = lazy(async () => {
  const mod = await import("@/components/account-background-scan-host");
  return { default: mod.AccountBackgroundScanHost };
});

const subscribeAccountBackgroundScan = (
  onStoreChange: () => void
): (() => void) => {
  window.addEventListener(
    LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
    onStoreChange
  );
  return () => {
    window.removeEventListener(
      LISTWELL_ACCOUNT_BACKGROUND_SCAN_EVENT,
      onStoreChange
    );
  };
};

const noBackgroundScan = (): string | null => null;

const isFullHeightChatShell = (pathname: string): boolean =>
  pathname === "/" || pathname === LISTWELL_CHAT_PATH;

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const scanName = useSyncExternalStore(
    subscribeAccountBackgroundScan,
    activeAccountBackgroundScanName,
    noBackgroundScan
  );
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
      {scanName ? (
        <Suspense fallback={null}>
          <AccountBackgroundScanHost />
        </Suspense>
      ) : null}
      <Shell scrollable={!isFullHeightChatShell(pathname)}>{children}</Shell>
    </>
  );
};
