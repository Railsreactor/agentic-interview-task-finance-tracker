import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { verifyEmail } from "#/server/auth.functions";
import { m } from "#/paraglide/messages";

//
// Landing page for the emailed link. Works logged in or out — the token
// alone identifies the account. Verification happens client-side on mount
// (not in a loader) so SSR/prefetch cannot burn the single-use token.

export const Route = createFileRoute("/verify-email")({
  validateSearch: z.object({ token: z.string().default("") }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const [result, setResult] = useState<
    { success: true } | { success: false; error: string } | null
  >(null);
  const doVerify = useServerFn(verifyEmail);
  // Guard against double-invocation (React StrictMode) — the second call
  // would find the token already consumed and report a false failure.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    doVerify({ data: { token } })
      .then((r) =>
        setResult(
          r && "error" in r && r.error
            ? { success: false, error: r.error }
            : { success: true },
        ),
      )
      .catch(() =>
        setResult({ success: false, error: m.verify_email_checking() }),
      );
  }, [doVerify, token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="island-shell rounded-xl p-8">
          <h1 className="text-2xl font-bold display-title mb-4">
            {m.verify_email_title()}
          </h1>

          {result === null ? (
            <p className="text-muted-foreground">{m.verify_email_checking()}</p>
          ) : result.success ? (
            <>
              <p role="status" className="text-sm mb-6">
                {m.verify_email_success()}
              </p>
              <Link
                to="/dashboard"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {m.verify_email_go_to_app()}
              </Link>
            </>
          ) : (
            <>
              <p role="alert" className="text-destructive text-sm mb-6">
                {result.error}
              </p>
              <Link
                to="/login"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {m.back_to_login()}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
