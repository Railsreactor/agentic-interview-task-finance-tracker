import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { requestPasswordReset } from "#/server/auth.functions";
import { useHydrated } from "#/lib/use-hydrated";
import { m } from "#/paraglide/messages";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";


export const Route = createFileRoute("/forgot-password")({
  beforeLoad: async ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const hydrated = useHydrated();

  const doRequest = useServerFn(requestPasswordReset);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const email = new FormData(e.currentTarget).get("email");
    if (typeof email !== "string") {
      setLoading(false);
      return;
    }

    try {
      const result = await doRequest({ data: { email } });
      if (result && "error" in result) {
        setMessage(result.error);
      } else {
        // Same copy whether or not the account exists — no enumeration.
        setSent(true);
      }
    } catch {
      setMessage(m.forgot_password_sent());
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="island-shell rounded-xl p-8">
          <h1 className="text-2xl font-bold display-title mb-2">
            {m.forgot_password_title()}
          </h1>
          <p className="text-muted-foreground mb-6">
            {m.forgot_password_desc()}
          </p>

          {sent ? (
            <p role="status" className="text-sm">
              {m.forgot_password_sent()}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label
                  htmlFor="email"
                  className="mb-1"
                >
                  {m.email_label()}
                </Label>
                <Input
                  type="email"
                  name="email"
                  id="email"
                  required
                  maxLength={255}
                  placeholder={m.email_label()}
                />
              </div>

              {message && (
                <div role="alert" className="text-destructive text-sm">
                  {message}
                </div>
              )}

              <Button className="w-full"
                type="submit"
                disabled={loading || !hydrated}
              >
                {!hydrated
                  ? m.loading()
                  : loading
                    ? m.forgot_password_sending()
                    : m.forgot_password_submit()}
              </Button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-line/50 text-center">
            <Link
              to="/login"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {m.back_to_login()}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
