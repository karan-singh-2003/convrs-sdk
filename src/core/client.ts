import type {
  AnalyticsConfig,
  AnyEvent,
  BaseEvent,
  TrackPageviewOptions,
  TrackEventOptions,
  TrackIdentifyOptions,
  TrackPaymentOptions,
  TrackRefundOptions,
  FlushResult,
} from "./types.js";
import { EventQueue } from "./queue.js";
import {
  createLogger,
  extractHostname,
  sanitizeProps,
  isValidEventName,
  isValidUrl,
  type Logger,
} from "./utils.js";

const DEFAULT_API_URL = "http://localhost:3000/api/track";

export class AnalyticsClient {
  private queue: EventQueue;
  private logger: Logger;
  private websiteId: string;

  constructor(config: AnalyticsConfig) {
    if (!config.websiteId) {
      throw new Error("[Analytics] websiteId is required");
    }

    this.websiteId = config.websiteId;
    this.logger = createLogger(config.debug ?? false);

const fetchImpl =
  config.fetch ??
  (typeof window !== "undefined"
    ? window.fetch.bind(window)
    : globalThis.fetch);
    
    if (!fetchImpl) {
      throw new Error(
        "[Analytics] fetch is not available. Pass a fetch implementation via config.fetch"
      );
    }

    this.queue = new EventQueue({
      apiUrl: config.apiUrl ?? DEFAULT_API_URL,
      websiteId: config.websiteId,
      maxBatchSize: config.maxBatchSize ?? 10,
      flushInterval: config.flushInterval ?? 5000,
      debug: config.debug ?? false,
      fetchImpl,
      onFlushError: (error, events) => {
        this.logger.error("Failed to send events:", error.message, events.length, "events dropped");
      },
    });

    this.logger.log("Analytics client initialized", { websiteId: config.websiteId });
  }

  // ─── Pageview ───────────────────────────────────────────────────────────────

  async trackPageview(options: TrackPageviewOptions): Promise<void> {
    if (!isValidUrl(options.url)) {
      this.logger.warn("trackPageview: invalid url", options.url);
      return;
    }

    const event: AnyEvent = {
      ...this.buildBase(options),
      type: "pageview",
    };

    await this.queue.enqueue(event);
    this.logger.log("Tracked pageview:", options.url);
  }

  // ─── Custom Event ───────────────────────────────────────────────────────────

  async trackEvent(options: TrackEventOptions): Promise<void> {
    if (!isValidEventName(options.eventName)) {
      this.logger.warn(
        "trackEvent: invalid event name — use lowercase alphanumeric, _ or -, max 64 chars:",
        options.eventName
      );
      return;
    }

    if (!isValidUrl(options.url)) {
      this.logger.warn("trackEvent: invalid url", options.url);
      return;
    }

    const sanitized = sanitizeProps(options.props as Record<string, unknown>);
    if (sanitized === null) {
      this.logger.warn("trackEvent: props validation failed, event dropped");
      return;
    }

    const event: AnyEvent = {
      ...this.buildBase(options),
      type: "event",
      event_name: options.eventName,
      props: sanitized,
    };

    await this.queue.enqueue(event);
    this.logger.log("Tracked event:", options.eventName, sanitized);
  }

  // ─── Identify ───────────────────────────────────────────────────────────────

  async identify(options: TrackIdentifyOptions): Promise<void> {
    if (!options.userId || typeof options.userId !== "string") {
      this.logger.warn("identify: userId is required");
      return;
    }

    if (!isValidUrl(options.url)) {
      this.logger.warn("identify: invalid url", options.url);
      return;
    }

    const sanitized = sanitizeProps(options.traits as Record<string, unknown>);

    const event: AnyEvent = {
      ...this.buildBase(options),
      type: "identify",
      traits: {
        user_id: options.userId,
        ...sanitized,
      },
    };

    await this.queue.enqueue(event);
    this.logger.log("Identified user:", options.userId);
  }

  // ─── Payment ────────────────────────────────────────────────────────────────

  async trackPayment(options: TrackPaymentOptions): Promise<void> {
    if (!options.revenue || typeof options.revenue.amount !== "number") {
      this.logger.warn("trackPayment: revenue.amount is required");
      return;
    }
    if (!options.revenue.currency) {
      this.logger.warn("trackPayment: revenue.currency is required");
      return;
    }

    const event: AnyEvent = {
      ...this.buildBase(options),
      type: "payment",
      revenue: options.revenue,
    };

    await this.queue.enqueue(event);
    this.logger.log(
      "Tracked payment:",
      options.revenue.amount,
      options.revenue.currency,
      "via",
      options.revenue.provider
    );
  }

  // ─── Refund ─────────────────────────────────────────────────────────────────

  async trackRefund(options: TrackRefundOptions): Promise<void> {
    if (!options.revenue || typeof options.revenue.amount !== "number") {
      this.logger.warn("trackRefund: revenue.amount is required");
      return;
    }

    const event: AnyEvent = {
      ...this.buildBase(options),
      type: "refund",
      revenue: options.revenue,
    };

    await this.queue.enqueue(event);
    this.logger.log("Tracked refund:", options.revenue.amount, options.revenue.currency);
  }

  // ─── Queue management ───────────────────────────────────────────────────────

  async flush(): Promise<FlushResult> {
    this.logger.log("Manual flush triggered");
    return this.queue.flush();
  }

  async shutdown(): Promise<FlushResult> {
    this.logger.log("Shutting down — flushing remaining events");
    return this.queue.shutdown();
  }

  get queueSize(): number {
    return this.queue.size;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private buildBase(
    options: Pick<
      TrackPageviewOptions,
      | "url"
      | "hostname"
      | "visitorId"
      | "sessionId"
      | "referrer"
      | "language"
      | "timezone"
      | "screen"
      | "viewport"
    > & { title?: string }
  ): BaseEvent {
    return {
      website_id: this.websiteId,
      visitor_id: options.visitorId,
      session_id: options.sessionId,
      type: "pageview", // overridden by caller
      url: options.url,
      hostname: options.hostname ?? extractHostname(options.url),
      referrer: options.referrer ?? null,
      title: options.title,
      language: options.language,
      timezone: options.timezone,
      timestamp: new Date().toISOString(),
      screen_w: options.screen?.w,
      screen_h: options.screen?.h,
      viewport_w: options.viewport?.w,
      viewport_h: options.viewport?.h,
    };
  }
}