import type { ReactNode } from "react";
import Link from "next/link";

export function Shell({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: string;
}) {
  return (
    <div className="vbg-report">
      <div className="vbg-shell">
        <a className="vbg-skip-link" href="#main">
          Skip to content
        </a>
        <header className="vbg-header">
          <div className="vbg-masthead">
            <span className="vbg-identity">
              <Link href="/">Listwell</Link>
            </span>
            <div className="vbg-document-meta">{meta ?? "Local and website SEO audit"}</div>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="vbg-footer">
          <span>Listwell</span>
          <span>© {new Date().getFullYear()}</span>
        </footer>
      </div>
    </div>
  );
}
