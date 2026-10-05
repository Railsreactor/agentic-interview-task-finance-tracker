//
// Pure helpers for the global HTTP security middleware in src/start.ts.
// No Node-only imports so the isomorphic start file can use them.

/**
 * Standard security response headers. CSP allows inline scripts/styles
 * because TanStack Start hydration and Vite inject inline tags; everything
 * else is locked to same-origin. `ws:`/`wss:` in connect-src keeps Vite HMR
 * working in dev.
 */
export function securityHeaders(isProd: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
  };
  if (isProd) {
    // Only meaningful behind TLS; skipping it in dev avoids pinning
    // localhost to https.
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains";
  }
  return headers;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Returns true when a state-changing request cannot be proven same-origin:
 * `Sec-Fetch-Site: cross-site`, an opaque `Origin: null`, or an `Origin`
 * whose host differs from the request host. Hosts are compared instead of
 * full origins so a TLS-terminating reverse proxy (https outside, http
 * inside) doesn't lock out legitimate traffic. Requests without browser
 * metadata (curl, tests, server-to-server) are allowed — cookies don't
 * ride along on those, so CSRF doesn't apply.
 */
export function isForbiddenCrossSite(
  method: string,
  headers: { get(name: string): string | null },
  requestUrl: string,
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;

  if (headers.get("sec-fetch-site") === "cross-site") return true;

  const origin = headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;

  try {
    return new URL(origin).host !== new URL(requestUrl).host;
  } catch {
    return true;
  }
}
