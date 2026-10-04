import Link from "next/link";

const footerLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
  { href: "/how-it-works", label: "How it works" },
] as const;

export const HomeFooter = () => (
  <footer className="home-footer">
    <nav aria-label="Legal and product information" className="home-footer__nav">
      <ul className="home-footer__links">
        {footerLinks.map((link) => (
          <li key={link.href}>
            <Link className="home-footer__link" href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
    <p className="home-footer__note">
      Listwell is operated by{" "}
      <a
        className="home-footer__studio"
        href="https://obambulo.studio"
        rel="noopener noreferrer"
        target="_blank"
      >
        obambulo studio
      </a>
      .
    </p>
  </footer>
);
