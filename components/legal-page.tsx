import Link from "next/link";
import type { ReactNode } from "react";

export const LegalPage = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="listwell-page listwell-legal">
    <Link className="listwell-back" href="/">
      Home
    </Link>
    <article className="listwell-panel">
      <div className="listwell-panel__head">
        <h1 className="listwell-panel__title">{title}</h1>
      </div>
      <div className="listwell-panel__body listwell-legal__body">{children}</div>
    </article>
  </section>
);

export const LegalSection = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="listwell-legal__section">
    <h2 className="listwell-legal__heading">{title}</h2>
    {children}
  </section>
);
