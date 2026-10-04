import type { ReactNode } from "react";

import { AccountControl, PageControls } from "@/components/page-controls";
import { ListwellHomeLink } from "@/components/listwell-home-link";

export const Shell = ({
  children,
  scrollable = false,
}: {
  children: ReactNode;
  scrollable?: boolean;
}) => (
  <div className="listwell-chat-shell bg-page text-ink">
    <a className="vbg-skip-link" href="#main">
      Skip to content
    </a>
    {scrollable ? <ListwellHomeLink className="listwell-page-home" /> : null}
    <AccountControl />
    <PageControls />
    <main
      id="main"
      className={
        scrollable
          ? "listwell-chat-shell__main listwell-chat-shell__main--page"
          : "listwell-chat-shell__main"
      }
    >
      {children}
    </main>
  </div>
);
