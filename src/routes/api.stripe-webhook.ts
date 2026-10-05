import { createFileRoute } from "@tanstack/react-router";
import { processStripeEvent, type StripeEvent } from "#/server/billing.server";
import { env } from "#/server/env";
import { getLogger } from "#/server/logger";
import { verifyStripeSignature } from "#/server/stripe.server";

//
// Stripe webhook receiver. Server-to-server POSTs carry no Origin header, so
// the global CSRF middleware lets them through; authenticity comes from the
// Stripe-Signature check against the raw body instead. Always answers 200
// for verified events (including duplicates and unhandled types) so Stripe
// doesn't retry work we've already done.
export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!env.billing.enabled || !env.billing.stripeWebhookSecret) {
          return new Response("Billing not configured", { status: 404 });
        }

        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        if (
          !verifyStripeSignature(
            rawBody,
            signature,
            env.billing.stripeWebhookSecret,
          )
        ) {
          getLogger().warn("stripe webhook rejected: bad signature");
          return new Response("Invalid signature", { status: 400 });
        }

        let event: StripeEvent;
        try {
          event = JSON.parse(rawBody) as StripeEvent;
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }
        if (!event?.id || !event?.type || !event?.data?.object) {
          return new Response("Invalid payload", { status: 400 });
        }

        const outcome = await processStripeEvent(event);
        return Response.json({ received: true, outcome });
      },
    },
  },
});
