import { env } from "#/server/env";
import { logger } from "#/server/logger";
import { getRequestContext } from "#/server/request-context";

//
// Sentry-compatible error reporting (Sentry or GlitchTip), enabled only when
// SENTRY_DSN is set. The SDK is loaded lazily so deployments without a DSN
// (self-hosted, dev, tests) pay nothing. Events are tagged with the request
// id — the same id every structured log line for that request carries — and
// the user id (never the email).

type SentryModule = typeof import("@sentry/node");

let sentry: SentryModule | null = null;

export async function initErrorReporting(): Promise<void> {
  const dsn = env.observability.sentryDsn;
  if (!dsn) return;
  const mod = await import("@sentry/node");
  mod.init({
    dsn,
    environment: env.isProduction ? "production" : "development",
    release: process.env.APP_VERSION || undefined,
    // Error tracking only — tracing would sample sensitive financial routes.
    tracesSampleRate: 0,
    // Breadcrumbs can capture console/fetch payloads; financial data must
    // never leave the box, so keep events to the exception itself.
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
  });
  sentry = mod;
  logger.info({ environment: env.isProduction ? "production" : "development" }, "error reporting enabled");
}

/**
 * Reports an exception to the error tracker (no-op without a DSN), tagged
 * with the current request/user context.
 */
export function reportError(error: unknown): void {
  if (!sentry) return;
  const ctx = getRequestContext();
  sentry.withScope((scope) => {
    if (ctx) {
      scope.setTag("request_id", ctx.requestId);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
    }
    sentry?.captureException(error);
  });
}

/** Whether an error tracker is configured (used by readiness diagnostics). */
export function isErrorReportingEnabled(): boolean {
  return sentry !== null;
}
