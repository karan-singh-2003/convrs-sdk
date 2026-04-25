import type { AnalyticsClient } from "../core/client.js";
import type {
  StripeCheckoutSessionCompleted,
  StripeInvoicePaid,
  StripeChargeRefunded,
  WebhookResult,
  RevenueData,
} from "../core/types.js";
import { normalizeAmount } from "../core/utils.js";

// Generic Stripe event envelope
interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface StripeWebhookOptions {
  /** Visitor ID to associate this payment with (from your session) */
  visitorId?: string;
  /** Session ID to associate this payment with */
  sessionId?: string;
  /** URL of the page where payment was initiated */
  url?: string;
  /** Raw webhook body as string (required for signature verification) */
  rawBody?: string;
  /** Stripe webhook signing secret (for signature verification) */
  webhookSecret?: string;
  /** Stripe instance (if you want SDK-level signature verification) */
  stripe?: {
    webhooks: {
      constructEvent: (body: string, sig: string, secret: string) => StripeEvent;
    };
  };
  /** Stripe-Signature header value (required if webhookSecret provided) */
  signature?: string;
}

export async function handleStripeWebhook(
  client: AnalyticsClient,
  event: StripeEvent,
  options: StripeWebhookOptions = {}
): Promise<WebhookResult> {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/stripe";

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as StripeCheckoutSessionCompleted;

        // Only track completed payments, not setup/free
        if (session.payment_status !== "paid" && session.mode !== "subscription") {
          return { tracked: false, eventType: event.type, provider: "stripe", error: "Payment not completed" };
        }

        const amount = session.amount_total
          ? normalizeAmount(session.amount_total, session.currency ?? "usd")
          : 0;
        const email =
          session.customer_email ??
          session.customer_details?.email ??
          undefined;

        const revenue: RevenueData = {
          amount,
          currency: (session.currency ?? "usd").toUpperCase(),
          provider: "stripe",
          provider_id: session.id,
          email,
          payment_type: session.subscription ? "subscription" : "one_time",
          plan: session.metadata?.plan,
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });

        return { tracked: true, eventType: event.type, provider: "stripe", amount, currency: revenue.currency, email };
      }

      case "invoice.paid": {
        const invoice = event.data.object as unknown as StripeInvoicePaid;
        const amount = normalizeAmount(invoice.amount_paid, invoice.currency);
        const email = invoice.customer_email ?? undefined;

        const revenue: RevenueData = {
          amount,
          currency: invoice.currency.toUpperCase(),
          provider: "stripe",
          provider_id: invoice.id,
          email,
          payment_type: "subscription",
          plan: invoice.metadata?.plan,
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });

        return { tracked: true, eventType: event.type, provider: "stripe", amount, currency: revenue.currency, email };
      }

      case "charge.refunded": {
        const charge = event.data.object as unknown as StripeChargeRefunded;
        const amount = normalizeAmount(charge.amount_refunded, charge.currency);
        const email = charge.receipt_email ?? undefined;

        const revenue: RevenueData = {
          amount,
          currency: charge.currency.toUpperCase(),
          provider: "stripe",
          provider_id: charge.id,
          email,
        };

        await client.trackRefund({ url, visitorId, sessionId, revenue });

        return { tracked: true, eventType: event.type, provider: "stripe", amount, currency: revenue.currency, email };
      }

      default:
        return { tracked: false, eventType: event.type, provider: "stripe", error: `Unhandled event type: ${event.type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tracked: false, eventType: event.type, provider: "stripe", error: message };
  }
}

/**
 * Verify a Stripe webhook signature and parse the event.
 * Requires the raw request body (not parsed JSON) and the signing secret.
 */
export function parseStripeWebhook(
  rawBody: string,
  signature: string,
  webhookSecret: string,
  stripe: StripeWebhookOptions["stripe"]
): StripeEvent {
  if (!stripe) {
    throw new Error("Stripe instance is required for signature verification");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}