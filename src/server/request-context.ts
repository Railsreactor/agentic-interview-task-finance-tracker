import { AsyncLocalStorage } from "node:async_hooks";

//
// Per-request context propagated via AsyncLocalStorage so any server code
// (loggers, error reporting, AI call metering) can attach the request id and
// the authenticated user id without threading them through every call.

export interface RequestContext {
  requestId: string;
  /** Set by session resolution once the user is authenticated. */
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Current request context, or undefined outside a request (startup, tests). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Runs fn with a fresh request context bound to the async execution tree. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Attaches the authenticated user id to the current request context. */
export function setContextUserId(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}
