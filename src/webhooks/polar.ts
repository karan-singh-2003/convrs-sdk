import type { AnalyticsClient } from "../core/client.js";
import type {
  PolarCheckout,
  PolarSubscription,
  WebhookResult,
  RevenueData,
} from "../core/types.js";
import { normalizeAmount } from "../core/utils.js";

interface PolarEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface PolarWebhookOptions {
  visitorId?: string;
  sessionId?: string;
  url?: string;
}

export async function handlePolarWebhook(
  client: AnalyticsClient,
  event: PolarEvent,
  options: PolarWebhookOptions = {}
): Promise<WebhookResult> {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/polar";

  try {
    switch (event.type) {
      case "checkout.created":
      case "checkout.updated": {
        const checkout = event.data as unknown as PolarCheckout;

        if (checkout.status !== "succeeded") {
          return { tracked: false, eventType: event.type, provider: "polar", error: "Checkout not succeeded" };
        }

        const amount = checkout.amount
          ? normalizeAmount(checkout.amount, checkout.currency ?? "usd")
          : 0;
        const email = checkout.customer_email ?? undefined;

        const revenue: RevenueData = {
          amount,
          currency: (checkout.currency ?? "usd").toUpperCase(),
          provider: "polar",
          provider_id: checkout.id,
          email,
          payment_type: "one_time",
          plan: checkout.product?.name,
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "polar", amount, currency: revenue.currency, email };
      }

      case "subscription.active":
      case "subscription.updated": {
        const sub = event.data as unknown as PolarSubscription;
        const amount = sub.amount
          ? normalizeAmount(sub.amount, sub.currency ?? "usd")
          : 0;
        const email = sub.user?.email ?? undefined;

        const revenue: RevenueData = {
          amount,
          currency: (sub.currency ?? "usd").toUpperCase(),
          provider: "polar",
          provider_id: sub.id,
          email,
          payment_type: "subscription",
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "polar", amount, currency: revenue.currency, email };
      }

      case "subscription.canceled":
      case "subscription.revoked": {
        const sub = event.data as unknown as PolarSubscription;
        const amount = sub.amount
          ? normalizeAmount(sub.amount, sub.currency ?? "usd")
          : 0;

        const revenue: RevenueData = {
          amount,
          currency: (sub.currency ?? "usd").toUpperCase(),
          provider: "polar",
          provider_id: sub.id,
          email: sub.user?.email ?? undefined,
          payment_type: "subscription",
        };

        await client.trackRefund({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "polar", amount, currency: revenue.currency };
      }

      default:
        return { tracked: false, eventType: event.type, provider: "polar", error: `Unhandled event: ${event.type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tracked: false, eventType: event.type, provider: "polar", error: message };
  }
}