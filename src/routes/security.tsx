import { createFileRoute } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";
import { LegalFooterNav, LegalSection } from "#/components/legal";


export const Route = createFileRoute("/security")({
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <div className="min-h-screen">
      <main className="page-wrap max-w-2xl py-10 space-y-6">
        <header>
          <h1 className="text-2xl font-bold display-title">
            {m.security_page_title()}
          </h1>
        </header>

        <p className="text-sm leading-relaxed">{m.security_intro()}</p>

        <LegalSection title={m.security_data_title()}>
          {m.security_data_body()}
        </LegalSection>
        <LegalSection title={m.security_measures_title()}>
          {m.security_measures_body()}
        </LegalSection>

        <section>
          <h2 className="text-base font-semibold mb-2">
            {m.security_reporting_title()}
          </h2>
          <p className="text-sm leading-relaxed">
            {m.security_reporting_body()}
          </p>
          <a
            href="/.well-known/security.txt"
            className="inline-block mt-2 text-sm underline hover:text-foreground"
          >
            {m.security_reporting_link()}
          </a>
        </section>

        <LegalSection title={m.security_residency_title()}>
          {m.security_residency_body()}
        </LegalSection>

        <LegalFooterNav />
      </main>
    </div>
  );
}
