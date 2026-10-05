import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "#/server/env";

//
// Thin fetch-based Stripe client — same pattern as the Resend client in
// email.ts. Only the three calls this app needs (Checkout session, Customer
// Portal session, webhook signature verification); no SDK dependency. All
// requests are form-encoded per the Stripe API convention.

const STRIPE_API_BASE = "https://api.stripe.com/v1";

/** Signed webhooks older than this are rejected (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verify a `Stripe-Signature` header against the raw request body.
 * The signed payload is `${timestamp}.${rawBody}`, HMAC-SHA256 with the
 * webhook secret, hex-encoded, carried as one or more `v1=` entries.
 * Comparison is constant-time; stale timestamps are rejected.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = WEBHOOK_TOLERANCE_SECONDS,
): boolean {
  if (!signatureHeader) return false;

  const parts = new Map<string, string[]>();
  for (const entry of signatureHeader.split(",")) {
    const eq = entry.indexOf("=");
    if (eq < 0) continue;
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    parts.set(key, [...(parts.get(key) ?? []), value]);
  }

  const timestamp = Number(parts.get("t")?.[0]);
  const candidates = parts.get("v1") ?? [];
  if (!Number.isFinite(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();
  return candidates.some((candidate) => {
    const buf = Buffer.from(candidate, "hex");
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
}

/** Build the signature header a Stripe delivery would carry — used by unit
 * tests and by nothing else at runtime. */
export function signStripePayload(
  rawBody: string,
  secret: string,
  timestampSeconds: number,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

/** Flatten nested params into Stripe's form encoding (a[b][0][c]=v). */
export function encodeStripeParams(
  params: Record<string, unknown>,
): URLSearchParams {
  const out = new URLSearchParams();
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${prefix}[${i}]`, item));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(prefix ? `${prefix}[${k}]` : k, v);
      }
    } else {
      out.append(prefix, String(value));
    }
  };
  walk("", params);
  return out;
}

async function stripeRequest<T>(
  path: string,
  params: Record<string, unknown>,
  method: "POST" | "DELETE" = "POST",
): Promise<T> {
  const key = env.billing.stripeSecretKey;
  if (!key) throw new Error("Stripe is not configured");
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "DELETE" ? undefined : encodeStripeParams(params),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Stripe API error ${response.status}: ${body.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

/**
 * Create a subscription Checkout session for the Pro plan. The user id rides
 * along as `client_reference_id` and as subscription metadata so webhook
 * events can always be attributed to a user.
 */
export async function createStripeCheckoutSession(input: {
  userId: string;
  email: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const session = await stripeRequest<{ url: string }>("/checkout/sessions", {
    mode: "subscription",
    client_reference_id: input.userId,
    customer_email: input.email ?? undefined,
    line_items: [{ price: env.billing.stripePricePro, quantity: 1 }],
    subscription_data: { metadata: { userId: input.userId } },
    automatic_tax: { enabled: true },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  return { url: session.url };
}

/**
 * Permanently delete a Stripe customer (GDPR account deletion). Stripe
 * cancels any active subscription as part of the delete.
 */
export async function deleteStripeCustomer(customerId: string): Promise<void> {
  await stripeRequest(`/customers/${customerId}`, {}, "DELETE");
}

/** Create a Customer Portal session (manage/cancel subscription, invoices). */
export async function createStripePortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const session = await stripeRequest<{ url: string }>(
    "/billing_portal/sessions",
    { customer: customerId, return_url: returnUrl },
  );
  return { url: session.url };
}
