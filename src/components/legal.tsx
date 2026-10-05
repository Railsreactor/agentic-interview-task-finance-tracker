import { Link } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";

//
// Shared building blocks for the public prose pages (/privacy, /terms,
// /security).

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <p className="text-sm leading-relaxed">{children}</p>
    </section>
  );
}

export function LegalFooterNav() {
  return (
    <nav className="flex flex-wrap gap-4 pt-4 border-t border-line text-sm text-muted-foreground">
      <Link to="/" className="hover:text-foreground">
        {m.page_title()}
      </Link>
      <Link to="/privacy" className="hover:text-foreground">
        {m.legal_privacy()}
      </Link>
      <Link to="/terms" className="hover:text-foreground">
        {m.legal_terms()}
      </Link>
      <Link to="/security" className="hover:text-foreground">
        {m.legal_security()}
      </Link>
    </nav>
  );
}
