import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { resetPassword } from "#/server/auth.functions";
import { useHydrated } from "#/lib/use-hydrated";
import { m } from "#/paraglide/messages";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";

//
// Reachable while logged in or out — a user who suspects account takeover
// must be able to complete a reset from any state.

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().default("") }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const hydrated = useHydrated();

  const doReset = useServerFn(resetPassword);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const password = new FormData(e.currentTarget).get("password");
    if (typeof password !== "string") {
      setLoading(false);
      return;
    }

    try {
      const result = await doReset({ data: { token, password } });
      if (result && "error" in result) {
        setMessage(result.error ?? null);
      } else {
        setDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="island-shell rounded-xl p-8">
          <h1 className="text-2xl font-bold display-title mb-2">
            {m.reset_password_title()}
          </h1>

          {done ? (
            <>
              <p role="status" className="text-sm mb-6">
                {m.reset_password_success()}
              </p>
              <Link
                to="/login"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {m.back_to_login()}
              </Link>
            </>
          ) : (
            <>
              <p className="text-muted-foreground mb-6">
                {m.reset_password_desc()}
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label
                    htmlFor="password"
                    className="mb-1"
                  >
                    {m.new_password_label()}
                  </Label>
                  <Input
                    type="password"
                    name="password"
                    id="password"
                    required
                    minLength={8}
                    maxLength={128}
                    placeholder={m.new_password_label()}
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
                      ? m.reset_password_saving()
                      : m.reset_password_submit()}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
