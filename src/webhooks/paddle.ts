import type { AnalyticsClient } from "../core/client.js";
import type { PaddleTransaction, WebhookResult, RevenueData } from "../core/types.js";

interface PaddleEvent {
  event_type: string;
  data: Record<string, unknown>;
}

export interface PaddleWebhookOptions {
  visitorId?: string;
  sessionId?: string;
  url?: string;
}

export async function handlePaddleWebhook(
  client: AnalyticsClient,
  event: PaddleEvent,
  options: PaddleWebhookOptions = {}
): Promise<WebhookResult> {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/paddle";

  try {
    switch (event.event_type) {
      case "transaction.completed": {
        const tx = event.data as unknown as PaddleTransaction;

        if (tx.status !== "completed") {
          return { tracked: false, eventType: event.event_type, provider: "paddle", error: "Transaction not completed" };
        }

        const rawAmount = tx.details?.totals?.total;
        const currency = tx.details?.totals?.currency_code ?? "USD";
        // Paddle sends totals as strings in smallest unit
        const amount = rawAmount ? parseInt(rawAmount, 10) / 100 : 0;
        const email = tx.customer?.email ?? undefined;

        const revenue: RevenueData = {
          amount,
          currency: currency.toUpperCase(),
          provider: "paddle",
          provider_id: tx.id,
          email,
          payment_type: "one_time",
          plan: tx.custom_data?.plan,
        };

        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.event_type, provider: "paddle", amount, currency, email };
      }

      case "transaction.refunded": {
        const tx = event.data as unknown as PaddleTransaction;
        const rawAmount = tx.details?.totals?.total;
        const currency = tx.details?.totals?.currency_code ?? "USD";
        const amount = rawAmount ? parseInt(rawAmount, 10) / 100 : 0;

        const revenue: RevenueData = {
          amount,
          currency: currency.toUpperCase(),
          provider: "paddle",
          provider_id: tx.id,
          email: tx.customer?.email ?? undefined,
        };

        await client.trackRefund({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.event_type, provider: "paddle", amount, currency };
      }

      default:
        return { tracked: false, eventType: event.event_type, provider: "paddle", error: `Unhandled event: ${event.event_type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { tracked: false, eventType: event.event_type, provider: "paddle", error: message };
  }
}