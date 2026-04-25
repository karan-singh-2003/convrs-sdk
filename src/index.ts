export { AnalyticsClient } from "./core/client.js";
export { EventQueue } from "./core/queue.js";

// Types
export type {
  AnalyticsConfig,
  EventType,
  BaseEvent,
  PageviewEvent,
  CustomEvent,
  IdentifyEvent,
  PaymentEvent,
  RefundEvent,
  AnyEvent,
  RevenueData,
  TrackPageviewOptions,
  TrackEventOptions,
  TrackIdentifyOptions,
  TrackPaymentOptions,
  TrackRefundOptions,
  FlushResult,
  WebhookResult,
  // Provider webhook types
  StripeCheckoutSessionCompleted,
  StripeInvoicePaid,
  StripeChargeRefunded,
  LemonSqueezyOrder,
  LemonSqueezySubscriptionPayment,
  PolarCheckout,
  PolarSubscription,
  PaddleTransaction,
} from "./core/types.js";

// Webhook handlers
export { handleStripeWebhook, parseStripeWebhook } from "./webhooks/stripe.js";
export type { StripeWebhookOptions } from "./webhooks/stripe.js";

export { handleLemonSqueezyWebhook } from "./webhooks/lemonsqueezy.js";
export type { LemonSqueezyWebhookOptions } from "./webhooks/lemonsqueezy.js";

export { handlePolarWebhook } from "./webhooks/polar.js";
export type { PolarWebhookOptions } from "./webhooks/polar.js";

export { handlePaddleWebhook } from "./webhooks/paddle.js";
export type { PaddleWebhookOptions } from "./webhooks/paddle.js";

// Utilities (useful for consumers)
export {
  generateId,
  sanitizeProps,
  isValidEventName,
  normalizeAmount,
  extractHostname,
} from "./core/utils.js";

// ─── Convenience factory ───────────────────────────────────────────────────────

import { AnalyticsClient } from "./core/client.js";
import type { AnalyticsConfig } from "./core/types.js";

/**
 * Create and return an analytics client.
 *
 * @example
 * ```ts
 * import { createAnalytics } from '@your-analytics/server';
 *
 * const analytics = createAnalytics({
 *   websiteId: 'your-website-id',
 *   apiUrl: 'https://your-server.com/api/track',
 *   debug: true,
 * });
 *
 * // Track a server-side event
 * await analytics.trackEvent({
 *   eventName: 'signup',
 *   url: 'https://yourapp.com/signup',
 *   visitorId: req.cookies._atk_vid,
 *   sessionId: req.cookies._atk_sid,
 *   props: { plan: 'pro' },
 * });
 *
 * // Flush remaining events on shutdown
 * process.on('SIGTERM', async () => {
 *   await analytics.shutdown();
 *   process.exit(0);
 * });
 * ```
 */
export function createAnalytics(config: AnalyticsConfig): AnalyticsClient {
  return new AnalyticsClient(config);
}