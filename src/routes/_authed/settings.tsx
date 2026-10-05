import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  cancelAccountDeletion,
  getDeletionStatus,
  requestAccountDeletion,
} from "#/server/compliance.functions";
import { m } from "#/paraglide/messages";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";


const DELETION_QUERY_KEY = ["deletion-status"] as const;

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const getDeletionStatusFn = useServerFn(getDeletionStatus);
  const requestAccountDeletionFn = useServerFn(requestAccountDeletion);
  const cancelAccountDeletionFn = useServerFn(cancelAccountDeletion);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [canceledNotice, setCanceledNotice] = useState(false);

  const { data: deletion } = useQuery({
    queryKey: DELETION_QUERY_KEY,
    queryFn: () => getDeletionStatusFn(),
  });

  const requestMutation = useMutation({
    mutationFn: (data: { password: string }) =>
      requestAccountDeletionFn({ data }),
    onSuccess: (result) => {
      if ("error" in result && result.error) {
        setDeleteError(result.error);
        return;
      }
      setConfirmOpen(false);
      setPassword("");
      setCanceledNotice(false);
      queryClient.invalidateQueries({ queryKey: DELETION_QUERY_KEY });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAccountDeletionFn(),
    onSuccess: () => {
      setCanceledNotice(true);
      queryClient.invalidateQueries({ queryKey: DELETION_QUERY_KEY });
    },
  });

  const graceDays = deletion?.graceDays ?? 14;
  const pendingDeletion = deletion?.effectiveAt
    ? new Date(deletion.effectiveAt).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/50 bg-header-bg/80 backdrop-blur-sm">
        <div className="page-wrap py-4">
          <h1 className="text-xl font-bold display-title">
            {m.settings_title()}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {m.settings_subtitle()}
          </p>
        </div>
      </header>

      <main className="page-wrap py-6 space-y-4 max-w-2xl">
        {pendingDeletion && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            role="alert"
            data-testid="deletion-pending-banner"
          >
            <p>{m.settings_deletion_pending({ date: pendingDeletion })}</p>
            <Button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              variant="outline" size="sm" className="mt-2"
            >
              {m.settings_deletion_cancel()}
            </Button>
          </div>
        )}
        {canceledNotice && !pendingDeletion && (
          <div
            className="rounded-md border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm"
            role="status"
          >
            {m.settings_deletion_canceled()}
          </div>
        )}

        {/* Data export */}
        <section className="rounded-lg border border-line bg-card p-5">
          <h2 className="text-sm font-medium">{m.settings_export_title()}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {m.settings_export_desc()}
          </p>
          {/* Plain anchor, not <Link> — the browser must treat this as a
              file download, not a client-side navigation. */}
          <a
            href="/api/export-data"
            download
            className="inline-block mt-3 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {m.settings_export_button()}
          </a>
        </section>

        {/* Account deletion */}
        <section className="rounded-lg border border-destructive/40 bg-card p-5">
          <h2 className="text-sm font-medium text-destructive">
            {m.settings_delete_title()}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {m.settings_delete_desc({ days: graceDays })}
          </p>

          {!pendingDeletion && !confirmOpen && (
            <Button
              onClick={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              variant="outline" className="mt-3 border-destructive/60 text-destructive hover:bg-destructive/10"
            >
              {m.settings_delete_button()}
            </Button>
          )}

          {!pendingDeletion && confirmOpen && (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setDeleteError(null);
                requestMutation.mutate({ password });
              }}
            >
              <p className="text-sm">
                {m.settings_delete_confirm_desc({ days: graceDays })}
              </p>
              <Label className="block text-sm">
                <span className="text-muted-foreground">
                  {m.password_label()}
                </span>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="mt-1 max-w-sm"
                />
              </Label>
              {deleteError && (
                <p className="text-sm text-destructive" role="alert">
                  {deleteError}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={requestMutation.isPending || password.length === 0}
                  variant="destructive"
                >
                  {m.settings_delete_confirm_button()}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(false);
                    setPassword("");
                    setDeleteError(null);
                  }}
                  className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
                >
                  {m.cancel()}
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* Legal links */}
        <nav className="flex gap-4 text-sm text-muted-foreground">
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
      </main>
    </div>
  );
}
