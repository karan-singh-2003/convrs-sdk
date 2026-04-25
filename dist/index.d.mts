interface AnalyticsConfig {
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
type EventType = "pageview" | "event" | "identify" | "payment" | "refund" | "external_link";
interface BaseEvent {
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
interface PageviewEvent extends BaseEvent {
    type: "pageview";
}
interface CustomEvent extends BaseEvent {
    type: "event";
    event_name: string;
    props?: Record<string, string | number | boolean>;
}
interface IdentifyEvent extends BaseEvent {
    type: "identify";
    traits: {
        user_id: string;
        name?: string;
        email?: string;
        [key: string]: string | number | boolean | undefined;
    };
}
interface PaymentEvent extends BaseEvent {
    type: "payment";
    revenue: RevenueData;
}
interface RefundEvent extends BaseEvent {
    type: "refund";
    revenue: RevenueData;
}
type AnyEvent = PageviewEvent | CustomEvent | IdentifyEvent | PaymentEvent | RefundEvent;
interface RevenueData {
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
interface TrackPageviewOptions {
    url: string;
    hostname?: string;
    referrer?: string | null;
    title?: string;
    visitorId: string;
    sessionId: string;
    language?: string;
    timezone?: string;
    screen?: {
        w: number;
        h: number;
    };
    viewport?: {
        w: number;
        h: number;
    };
}
interface TrackEventOptions {
    eventName: string;
    url: string;
    hostname?: string;
    visitorId: string;
    sessionId: string;
    props?: Record<string, string | number | boolean>;
    referrer?: string | null;
}
interface TrackIdentifyOptions {
    url: string;
    hostname?: string;
    visitorId: string;
    sessionId: string;
    userId: string;
    traits?: Record<string, string | number | boolean>;
}
interface TrackPaymentOptions {
    url: string;
    hostname?: string;
    visitorId: string;
    sessionId: string;
    revenue: RevenueData;
}
interface TrackRefundOptions {
    url: string;
    hostname?: string;
    visitorId: string;
    sessionId: string;
    revenue: RevenueData;
}
interface StripeCheckoutSessionCompleted {
    id: string;
    object: "checkout.session";
    customer_email?: string | null;
    customer_details?: {
        email?: string | null;
    };
    amount_total?: number | null;
    currency?: string | null;
    payment_status: string;
    metadata?: Record<string, string>;
    subscription?: string | null;
    mode: "payment" | "subscription" | "setup";
}
interface StripeInvoicePaid {
    id: string;
    object: "invoice";
    customer_email?: string | null;
    amount_paid: number;
    currency: string;
    subscription?: string | null;
    metadata?: Record<string, string>;
}
interface StripeChargeRefunded {
    id: string;
    object: "charge";
    amount_refunded: number;
    currency: string;
    receipt_email?: string | null;
    metadata?: Record<string, string>;
}
interface LemonSqueezyOrder {
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
interface LemonSqueezySubscriptionPayment {
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
interface PolarCheckout {
    id: string;
    status: string;
    customer_email?: string | null;
    amount?: number | null;
    currency?: string | null;
    product?: {
        name?: string;
    };
}
interface PolarSubscription {
    id: string;
    status: string;
    user?: {
        email?: string;
    };
    amount?: number | null;
    currency?: string | null;
}
interface PaddleTransaction {
    id: string;
    status: string;
    customer?: {
        email?: string;
    };
    details?: {
        totals?: {
            total?: string;
            currency_code?: string;
        };
    };
    custom_data?: Record<string, string>;
}
interface WebhookResult {
    tracked: boolean;
    eventType: string;
    provider: string;
    amount?: number;
    currency?: string;
    email?: string;
    error?: string;
}
interface FlushResult {
    sent: number;
    failed: number;
    errors: string[];
}

declare class AnalyticsClient {
    private queue;
    private logger;
    private websiteId;
    constructor(config: AnalyticsConfig);
    trackPageview(options: TrackPageviewOptions): Promise<void>;
    trackEvent(options: TrackEventOptions): Promise<void>;
    identify(options: TrackIdentifyOptions): Promise<void>;
    trackPayment(options: TrackPaymentOptions): Promise<void>;
    trackRefund(options: TrackRefundOptions): Promise<void>;
    flush(): Promise<FlushResult>;
    shutdown(): Promise<FlushResult>;
    get queueSize(): number;
    private buildBase;
}

interface QueueOptions {
    apiUrl: string;
    websiteId: string;
    maxBatchSize: number;
    flushInterval: number;
    debug: boolean;
    fetchImpl: typeof fetch;
    onFlushError?: (error: Error, events: AnyEvent[]) => void;
}
declare class EventQueue {
    private queue;
    private flushTimer;
    private isFlushing;
    private logger;
    private opts;
    constructor(opts: QueueOptions);
    enqueue(payload: AnyEvent): Promise<void>;
    flush(): Promise<FlushResult>;
    private sendBatch;
    private sendOne;
    get size(): number;
    shutdown(): Promise<FlushResult>;
    clear(): Promise<void>;
    private startFlushTimer;
    private stopFlushTimer;
}

interface StripeEvent {
    id: string;
    type: string;
    data: {
        object: Record<string, unknown>;
    };
}
interface StripeWebhookOptions {
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
declare function handleStripeWebhook(client: AnalyticsClient, event: StripeEvent, options?: StripeWebhookOptions): Promise<WebhookResult>;
/**
 * Verify a Stripe webhook signature and parse the event.
 * Requires the raw request body (not parsed JSON) and the signing secret.
 */
declare function parseStripeWebhook(rawBody: string, signature: string, webhookSecret: string, stripe: StripeWebhookOptions["stripe"]): StripeEvent;

interface LemonSqueezyEvent {
    meta: {
        event_name: string;
        custom_data?: Record<string, string>;
    };
    data: Record<string, unknown>;
}
interface LemonSqueezyWebhookOptions {
    visitorId?: string;
    sessionId?: string;
    url?: string;
}
declare function handleLemonSqueezyWebhook(client: AnalyticsClient, event: LemonSqueezyEvent, options?: LemonSqueezyWebhookOptions): Promise<WebhookResult>;

interface PolarEvent {
    type: string;
    data: Record<string, unknown>;
}
interface PolarWebhookOptions {
    visitorId?: string;
    sessionId?: string;
    url?: string;
}
declare function handlePolarWebhook(client: AnalyticsClient, event: PolarEvent, options?: PolarWebhookOptions): Promise<WebhookResult>;

interface PaddleEvent {
    event_type: string;
    data: Record<string, unknown>;
}
interface PaddleWebhookOptions {
    visitorId?: string;
    sessionId?: string;
    url?: string;
}
declare function handlePaddleWebhook(client: AnalyticsClient, event: PaddleEvent, options?: PaddleWebhookOptions): Promise<WebhookResult>;

declare function generateId(): string;
declare function isValidEventName(name: unknown): name is string;
declare function sanitizeProps(props: Record<string, unknown> | undefined): Record<string, string> | null;
declare function normalizeAmount(amount: number, currency: string): number;
declare function extractHostname(url: string): string;

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
declare function createAnalytics(config: AnalyticsConfig): AnalyticsClient;

export { AnalyticsClient, type AnalyticsConfig, type AnyEvent, type BaseEvent, type CustomEvent, EventQueue, type EventType, type FlushResult, type IdentifyEvent, type LemonSqueezyOrder, type LemonSqueezySubscriptionPayment, type LemonSqueezyWebhookOptions, type PaddleTransaction, type PaddleWebhookOptions, type PageviewEvent, type PaymentEvent, type PolarCheckout, type PolarSubscription, type PolarWebhookOptions, type RefundEvent, type RevenueData, type StripeChargeRefunded, type StripeCheckoutSessionCompleted, type StripeInvoicePaid, type StripeWebhookOptions, type TrackEventOptions, type TrackIdentifyOptions, type TrackPageviewOptions, type TrackPaymentOptions, type TrackRefundOptions, type WebhookResult, createAnalytics, extractHostname, generateId, handleLemonSqueezyWebhook, handlePaddleWebhook, handlePolarWebhook, handleStripeWebhook, isValidEventName, normalizeAmount, parseStripeWebhook, sanitizeProps };
