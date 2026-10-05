import { initErrorReporting, reportError } from "#/server/error-reporting";
import { getLogger, logger } from "#/server/logger";
import { runWithRequestContext } from "#/server/request-context";

//
// Server-only glue behind the global middleware in src/start.ts. Loaded via
// dynamic import inside `.server()` handlers so none of it (pino,
// async_hooks, Sentry) can leak into the client bundle.

await initErrorReporting();

// Static assets are logged at debug to keep info-level logs one-line-per-
// user-action rather than one-per-chunk.
const ASSET_PATH = /\.(?:js|mjs|css|map|png|jpe?g|svg|ico|woff2?|ttf|txt)$/i;

// Errors already reported by the function middleware must not be double-
// counted when they bubble to the request middleware.
const reported = new WeakSet<object>();

function captureError(error: unknown, where: string): void {
  // Thrown Responses (401s, redirects) are control flow, not defects.
  if (error instanceof Response) return;
  if (typeof error === "object" && error !== null) {
    if (reported.has(error)) return;
    reported.add(error);
  }
  getLogger().error(
    { err: error instanceof Error ? error : new Error(String(error)), where },
    "unhandled server error",
  );
  reportError(error);
}

/**
 * Wraps a request in a fresh request context: generates (or adopts) the
 * request id, logs method/path/status/duration, echoes the id back in the
 * `x-request-id` response header, and captures unhandled errors.
 */
export async function handleRequest<T extends { response: Response }>(
  request: Request,
  next: () => T | PromiseLike<T>,
): Promise<T> {
  const requestId =
    request.headers.get("x-request-id") || crypto.randomUUID();
  return runWithRequestContext({ requestId }, async () => {
    const start = performance.now();
    const path = new URL(request.url).pathname;
    try {
      const result = await next();
      result.response.headers.set("x-request-id", requestId);
      const line = {
        method: request.method,
        path,
        status: result.response.status,
        durationMs: Math.round(performance.now() - start),
      };
      if (ASSET_PATH.test(path)) {
        getLogger().debug(line, "request");
      } else {
        getLogger().info(line, "request");
      }
      return result;
    } catch (error) {
      captureError(error, `request ${request.method} ${path}`);
      throw error;
    }
  });
}

/** Error capture for server-function handlers (global function middleware). */
export function onServerFnError(error: unknown): void {
  captureError(error, "server-function");
}

export { logger };
