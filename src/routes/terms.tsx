import { createFileRoute } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";
import { LegalFooterNav, LegalSection } from "#/components/legal";


export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen">
      <main className="page-wrap max-w-2xl py-10 space-y-6">
        <header>
          <h1 className="text-2xl font-bold display-title">
            {m.terms_title()}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {m.terms_updated()}
          </p>
          <p className="text-xs text-muted-foreground mt-2 italic">
            {m.legal_template_notice()}
          </p>
        </header>

        <p className="text-sm leading-relaxed">{m.terms_intro()}</p>

        <LegalSection title={m.terms_service_title()}>
          {m.terms_service_body()}
        </LegalSection>
        <LegalSection title={m.terms_account_title()}>
          {m.terms_account_body()}
        </LegalSection>
        <LegalSection title={m.terms_billing_title()}>
          {m.terms_billing_body()}
        </LegalSection>
        <LegalSection title={m.terms_data_title()}>
          {m.terms_data_body()}
        </LegalSection>
        <LegalSection title={m.terms_acceptable_title()}>
          {m.terms_acceptable_body()}
        </LegalSection>
        <LegalSection title={m.terms_liability_title()}>
          {m.terms_liability_body()}
        </LegalSection>
        <LegalSection title={m.terms_termination_title()}>
          {m.terms_termination_body()}
        </LegalSection>
        <LegalSection title={m.terms_changes_title()}>
          {m.terms_changes_body()}
        </LegalSection>

        <LegalFooterNav />
      </main>
    </div>
  );
}
