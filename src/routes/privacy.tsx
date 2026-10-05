import { createFileRoute } from "@tanstack/react-router";
import { m } from "#/paraglide/messages";
import { LegalFooterNav, LegalSection } from "#/components/legal";
import {
  AI_RAW_RESPONSE_RETENTION_DAYS,
  DELETION_GRACE_DAYS,
} from "#/lib/compliance-constants";


export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <main className="page-wrap max-w-2xl py-10 space-y-6">
        <header>
          <h1 className="text-2xl font-bold display-title">
            {m.privacy_title()}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {m.privacy_updated()}
          </p>
          <p className="text-xs text-muted-foreground mt-2 italic">
            {m.legal_template_notice()}
          </p>
        </header>

        <p className="text-sm leading-relaxed">{m.privacy_intro()}</p>

        <LegalSection title={m.privacy_what_title()}>
          {m.privacy_what_body()}
        </LegalSection>
        <LegalSection title={m.privacy_why_title()}>
          {m.privacy_why_body()}
        </LegalSection>
        <LegalSection title={m.privacy_ai_title()}>
          {m.privacy_ai_body({ days: AI_RAW_RESPONSE_RETENTION_DAYS })}
        </LegalSection>

        <section>
          <h2 className="text-base font-semibold mb-2">
            {m.privacy_subprocessors_title()}
          </h2>
          <p className="text-sm leading-relaxed mb-2">
            {m.privacy_subprocessors_intro()}
          </p>
          <ul className="list-disc pl-5 text-sm leading-relaxed space-y-1">
            <li>{m.privacy_sub_hosting()}</li>
            <li>{m.privacy_sub_storage()}</li>
            <li>{m.privacy_sub_stripe()}</li>
            <li>{m.privacy_sub_email()}</li>
            <li>{m.privacy_sub_ai()}</li>
          </ul>
        </section>

        <LegalSection title={m.privacy_retention_title()}>
          {m.privacy_retention_body({
            days: AI_RAW_RESPONSE_RETENTION_DAYS,
            graceDays: DELETION_GRACE_DAYS,
          })}
        </LegalSection>
        <LegalSection title={m.privacy_rights_title()}>
          {m.privacy_rights_body()}
        </LegalSection>
        <LegalSection title={m.privacy_cookies_title()}>
          {m.privacy_cookies_body()}
        </LegalSection>
        <LegalSection title={m.privacy_contact_title()}>
          {m.privacy_contact_body()}
        </LegalSection>

        <LegalFooterNav />
      </main>
    </div>
  );
}
