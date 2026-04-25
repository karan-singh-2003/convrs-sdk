import type { AnalyticsClient } from "../core/client.js";
import type {
  LemonSqueezyOrder,
  LemonSqueezySubscriptionPayment,
  WebhookResult,
  RevenueData,
} from "../core/types.js";

interface LemonSqueezyEvent {
  meta: { event_name: string; custom_data?: Record<string, string> };
  data: Record<string, unknown>;
}

export interface LemonSqueezyWebhookOptions {
  visitorId?: string;
  sessionId?: string;
  url?: string;
}

export async function handleLemonSqueezyWebhook(
  client: AnalyticsClient,
  event: LemonSqueezyEvent,
  options: LemonSqueezyWebhookOptions = {}
): Promise<WebhookResult> {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/lemonsqueezy";
  const eventName = event.meta.event_name;

  try {
    switch (eventName) {
      case "order_created": {
        const order = { data: event.data } as unknown as LemonSqueezyOrder;
        const attrs = order.data.attributes;

        // LemonSqueezy sends amounts in cents
        const amount = attrs.total / 100;
        const revenue: RevenueData = {
          amount,
          currency: attrs.currency.toUpperCase(),
          provider: "lemonsqueezy",
          provider_id: String(order.data.id),
          email: attrs.user_email,
          payment_type: "one_time",
          plan: attrs.first_order_item?.product_name,
          order_id: String(attrs.order_number),
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: eventName, provider: "lemonsqueezy", amount, currency: revenue.currency, email: attrs.user_email };
      }

      case "subscription_payment_success": {
        const sub = { data: event.data } as unknown as LemonSqueezySubscriptionPayment;
        const attrs = sub.data.attributes;
        const amount = attrs.total / 100;

        const revenue: RevenueData = {
          amount,
          currency: attrs.currency.toUpperCase(),
          provider: "lemonsqueezy",
          provider_id: String(sub.data.id),
          email: attrs.user_email,
          payment_type: "subscription",
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: eventName, provider: "lemonsqueezy", amount, currency: revenue.currency, email: attrs.user_email };
      }

      case "order_refunded": {
        const order = { data: event.data } as unknown as LemonSqueezyOrder;
        const attrs = order.data.attributes;
        const amount = attrs.total / 100;

        const revenue: RevenueData = {
          amount,
          currency: attrs.currency.toUpperCase(),
          provider: "lemonsqueezy",
          provider_id: String(order.data.id),
          email: attrs.user_email,
        };

        await client.trackRefund({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: eventName, provider: "lemonsqueezy", amount, currency: revenue.currency, email: attrs.user_email };
      }

      default:
        return { tracked: false, eventType: eventName, provider: "lemonsqueezy", error: `Unhandled event: ${eventName}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tracked: false, eventType: eventName, provider: "lemonsqueezy", error: message };
  }
}