// ─── SDK Config ────────────────────────────────────────────────────────────────

export interface AnalyticsConfig {
  /** Your website/workspace ID */
  websiteId: string;
  /** API endpoint — defaults to your own server */
  apiUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Max events to batch before auto-flush (default: 10) */
  maxBatchSize?: number;
  /** Interval in ms between auto-flushes (default: 5000) */
  flushInterval?: number;
  /** Custom fetch implementation (e.g. node-fetch in older Node versions) */
  fetch?: typeof fetch;
}

// ─── Event Types ───────────────────────────────────────────────────────────────

export type EventType =
  | "pageview"
  | "event"
  | "identify"
  | "payment"
  | "refund"
  | "external_link";

export interface BaseEvent {
  website_id: string;
  visitor_id: string;
  session_id: string;
  type: EventType;
  url: string;
  hostname: string;
  referrer?: string | null;
  title?: string;
  language?: string;
  timezone?: string;
  timestamp: string;
  screen_w?: number;
  screen_h?: number;
  viewport_w?: number;
  viewport_h?: number;
}

export interface PageviewEvent extends BaseEvent {
  type: "pageview";
}

export interface CustomEvent extends BaseEvent {
  type: "event";
  event_name: string;
  props?: Record<string, string | number | boolean>;
}

export interface IdentifyEvent extends BaseEvent {
  type: "identify";
  traits: {
    user_id: string;
    name?: string;
    email?: string;
    [key: string]: string | number | boolean | undefined;
  };
}

export interface PaymentEvent extends BaseEvent {
  type: "payment";
  revenue: RevenueData;
}

export interface RefundEvent extends BaseEvent {
  type: "refund";
  revenue: RevenueData;
}

export type AnyEvent =
  | PageviewEvent
  | CustomEvent
  | IdentifyEvent
  | PaymentEvent
  | RefundEvent;

// ─── Revenue ───────────────────────────────────────────────────────────────────

export interface RevenueData {
  /** Payment amount in smallest currency unit (cents for USD) OR float */
  amount: number;
  /** ISO 4217 currency code e.g. "USD", "EUR", "INR" */
  currency: string;
  /** Payment provider */
  provider: "stripe" | "lemonsqueezy" | "polar" | "paddle" | "manual";
  /** Provider-specific transaction/order/session ID */
  provider_id?: string;
  /** Customer email */
  email?: string;
  /** Plan or product name */
  plan?: string;
  /** "one_time" | "subscription" */
  payment_type?: "one_time" | "subscription";
  /** Internal order/invoice reference */
  order_id?: string;
}

// ─── Track Options ─────────────────────────────────────────────────────────────

export interface TrackPageviewOptions {
  url: string;
  hostname?: string;
  referrer?: string | null;
  title?: string;
  visitorId: string;
  sessionId: string;
  language?: string;
  timezone?: string;
  screen?: { w: number; h: number };
  viewport?: { w: number; h: number };
}

export interface TrackEventOptions {
  eventName: string;
  url: string;
  hostname?: string;
  visitorId: string;
  sessionId: string;
  props?: Record<string, string | number | boolean>;
  referrer?: string | null;
}

export interface TrackIdentifyOptions {
  url: string;
  hostname?: string;
  visitorId: string;
  sessionId: string;
  userId: string;
  traits?: Record<string, string | number | boolean>;
}

export interface TrackPaymentOptions {
  url: string;
  hostname?: string;
  visitorId: string;
  sessionId: string;
  revenue: RevenueData;
}

export interface TrackRefundOptions {
  url: string;
  hostname?: string;
  visitorId: string;
  sessionId: string;
  revenue: RevenueData;
}

// ─── Webhook Payloads ──────────────────────────────────────────────────────────

// Stripe
export interface StripeCheckoutSessionCompleted {
  id: string;
  object: "checkout.session";
  customer_email?: string | null;
  customer_details?: { email?: string | null };
  amount_total?: number | null;
  currency?: string | null;
  payment_status: string;
  metadata?: Record<string, string>;
  subscription?: string | null;
  mode: "payment" | "subscription" | "setup";
}

export interface StripeInvoicePaid {
  id: string;
  object: "invoice";
  customer_email?: string | null;
  amount_paid: number;
  currency: string;
  subscription?: string | null;
  metadata?: Record<string, string>;
}

export interface StripeChargeRefunded {
  id: string;
  object: "charge";
  amount_refunded: number;
  currency: string;
  receipt_email?: string | null;
  metadata?: Record<string, string>;
}

// LemonSqueezy
export interface LemonSqueezyOrder {
  data: {
    id: string;
    attributes: {
      user_email: string;
      total: number;
      currency: string;
      order_number: number;
      status: string;
      first_order_item?: {
        product_name?: string;
        variant_name?: string;
      };
    };
  };
}

export interface LemonSqueezySubscriptionPayment {
  data: {
    id: string;
    attributes: {
      user_email: string;
      total: number;
      currency: string;
      status: string;
    };
  };
}

// Polar
export interface PolarCheckout {
  id: string;
  status: string;
  customer_email?: string | null;
  amount?: number | null;
  currency?: string | null;
  product?: { name?: string };
}

export interface PolarSubscription {
  id: string;
  status: string;
  user?: { email?: string };
  amount?: number | null;
  currency?: string | null;
}

// Paddle
export interface PaddleTransaction {
  id: string;
  status: string;
  customer?: { email?: string };
  details?: {
    totals?: { total?: string; currency_code?: string };
  };
  custom_data?: Record<string, string>;
}

// ─── Webhook Handler Result ────────────────────────────────────────────────────

export interface WebhookResult {
  tracked: boolean;
  eventType: string;
  provider: string;
  amount?: number;
  currency?: string;
  email?: string;
  error?: string;
}

// ─── Flush Result ──────────────────────────────────────────────────────────────

export interface FlushResult {
  sent: number;
  failed: number;
  errors: string[];
}