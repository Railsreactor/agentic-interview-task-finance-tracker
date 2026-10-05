import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { register } from "#/server/auth.functions";
import { useHydrated } from "#/lib/use-hydrated";
import { m } from "#/paraglide/messages";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";


export const Route = createFileRoute("/setup")({
  beforeLoad: async ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SetupPage,
});

function SetupPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hydrated = useHydrated();

  const doRegister = useServerFn(register);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username");
    const email = formData.get("email");
    const password = formData.get("password");
    if (
      typeof username !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      setLoading(false);
      return;
    }

    try {
      const result = await doRegister({ data: { username, email, password } });
      if (result && "error" in result) {
        setMessage(result.error);
      }
    } catch {
      // redirect will happen automatically
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="island-shell rounded-xl p-8">
          <h1 className="text-2xl font-bold display-title mb-2">
            {m.setup_page_title()}
          </h1>
          <p className="text-muted-foreground mb-6">
            {m.enter_credentials()}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label
                htmlFor="username"
                className="mb-1"
              >
                {m.username_label()}
              </Label>
              <Input
                type="text"
                name="username"
                id="username"
                required
                minLength={2}
                maxLength={32}
                placeholder={m.username_label()}
              />
            </div>

            <div>
              <Label htmlFor="email" className="mb-1">
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

            <div>
              <Label
                htmlFor="password"
                className="mb-1"
              >
                {m.password_label()}
              </Label>
              <Input
                type="password"
                name="password"
                id="password"
                required
                minLength={8}
                maxLength={128}
                placeholder={m.password_label()}
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
                  ? m.creating_account()
                  : m.create_account()}
            </Button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground text-center">
            {m.setup_legal_agree()}
          </p>
          <nav className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground">
              {m.legal_terms()}
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              {m.legal_privacy()}
            </Link>
            <Link to="/security" className="hover:text-foreground">
              {m.legal_security()}
            </Link>
          </nav>
        </div>
      </div>
    </div>
  );
}
