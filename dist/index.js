'use strict';

var crypto = require('crypto');

// src/core/utils.ts
function createLogger(debug) {
  return {
    log: (...args) => {
      if (debug) console.log("[Analytics]", ...args);
    },
    warn: (...args) => {
      if (debug) console.warn("[Analytics]", ...args);
    },
    error: (...args) => console.error("[Analytics]", ...args)
  };
}
function generateId() {
  return crypto.randomUUID();
}
function generateEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function isValidEventName(name) {
  if (!name || typeof name !== "string") return false;
  if (name.length === 0 || name.length > 64) return false;
  return /^[a-z0-9_-]+$/i.test(name);
}
function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
function sanitizeProps(props) {
  if (!props) return {};
  if (typeof props !== "object" || Array.isArray(props)) return {};
  const out = {};
  const entries = Object.entries(props);
  if (entries.length > 10) {
    console.warn("[Analytics] Max 10 custom props allowed");
    return null;
  }
  for (const [key, value] of entries) {
    if (!key || typeof key !== "string" || key.length > 32) continue;
    if (!/^[a-z0-9_-]+$/i.test(key)) continue;
    let val = value == null ? "" : String(value);
    if (val.length > 255) val = val.slice(0, 255);
    val = val.replace(/[<>'"&]/g, "").replace(/javascript:/gi, "").replace(/on\w+=/gi, "").trim();
    out[key.toLowerCase()] = val;
  }
  return out;
}
function normalizeAmount(amount, currency) {
  const zerDecimalCurrencies = [
    "JPY",
    "KRW",
    "VND",
    "BIF",
    "CLP",
    "GNF",
    "MGA",
    "PYG",
    "RWF",
    "UGX",
    "XAF",
    "XOF",
    "XPF"
  ];
  if (zerDecimalCurrencies.includes(currency.toUpperCase())) {
    return amount;
  }
  if (Number.isInteger(amount) && amount > 100) {
    return amount / 100;
  }
  return amount;
}
function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// src/core/queue.ts
var MAX_RETRIES = 3;
var EventQueue = class {
  constructor(opts) {
    this.queue = [];
    this.flushTimer = null;
    this.isFlushing = false;
    this.opts = opts;
    this.logger = createLogger(opts.debug);
    this.startFlushTimer();
  }
  async enqueue(payload) {
    const event = {
      id: generateEventId(),
      payload,
      timestamp: Date.now(),
      retries: 0
    };
    this.queue.push(event);
    this.logger.log(`Queued ${payload.type} event (queue size: ${this.queue.length})`);
    if (this.queue.length >= this.opts.maxBatchSize) {
      this.logger.log("Max batch size reached \u2014 flushing immediately");
      await this.flush();
    }
  }
  async flush() {
    if (this.isFlushing || this.queue.length === 0) {
      return { sent: 0, failed: 0, errors: [] };
    }
    this.isFlushing = true;
    const toProcess = [...this.queue];
    const result = { sent: 0, failed: 0, errors: [] };
    this.logger.log(`Flushing ${toProcess.length} event(s)`);
    const batches = chunk(toProcess, this.opts.maxBatchSize);
    for (const batch of batches) {
      try {
        await this.sendBatch(batch.map((e) => e.payload));
        const sentIds = new Set(batch.map((e) => e.id));
        this.queue = this.queue.filter((e) => !sentIds.has(e.id));
        result.sent += batch.length;
        this.logger.log(`Sent batch of ${batch.length} event(s)`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        result.errors.push(err.message);
        for (const event of batch) {
          event.retries++;
          if (event.retries >= MAX_RETRIES) {
            this.queue = this.queue.filter((e) => e.id !== event.id);
            result.failed++;
            this.logger.error(`Dropping event ${event.id} after ${MAX_RETRIES} retries`);
            this.opts.onFlushError?.(err, [event.payload]);
          }
        }
      }
    }
    this.isFlushing = false;
    return result;
  }
  async sendBatch(events) {
    await Promise.all(
      events.map((event) => this.sendOne(event))
    );
  }
  async sendOne(event) {
    const body = JSON.stringify(event);
    const response = await this.opts.fetchImpl(this.opts.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  }
  get size() {
    return this.queue.length;
  }
  async shutdown() {
    this.stopFlushTimer();
    return this.flush();
  }
  async clear() {
    this.queue = [];
  }
  startFlushTimer() {
    this.stopFlushTimer();
    this.flushTimer = setInterval(async () => {
      if (this.queue.length > 0) {
        await this.flush();
      }
    }, this.opts.flushInterval);
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
};
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// src/core/client.ts
var DEFAULT_API_URL = "http://localhost:3000/api/track";
var AnalyticsClient = class {
  constructor(config) {
    if (!config.websiteId) {
      throw new Error("[Analytics] websiteId is required");
    }
    this.websiteId = config.websiteId;
    this.logger = createLogger(config.debug ?? false);
    const fetchImpl = config.fetch ?? (typeof window !== "undefined" ? window.fetch.bind(window) : globalThis.fetch);
    if (!fetchImpl) {
      throw new Error(
        "[Analytics] fetch is not available. Pass a fetch implementation via config.fetch"
      );
    }
    this.queue = new EventQueue({
      apiUrl: config.apiUrl ?? DEFAULT_API_URL,
      websiteId: config.websiteId,
      maxBatchSize: config.maxBatchSize ?? 10,
      flushInterval: config.flushInterval ?? 5e3,
      debug: config.debug ?? false,
      fetchImpl,
      onFlushError: (error, events) => {
        this.logger.error("Failed to send events:", error.message, events.length, "events dropped");
      }
    });
    this.logger.log("Analytics client initialized", { websiteId: config.websiteId });
  }
  // ─── Pageview ───────────────────────────────────────────────────────────────
  async trackPageview(options) {
    if (!isValidUrl(options.url)) {
      this.logger.warn("trackPageview: invalid url", options.url);
      return;
    }
    const event = {
      ...this.buildBase(options),
      type: "pageview"
    };
    await this.queue.enqueue(event);
    this.logger.log("Tracked pageview:", options.url);
  }
  // ─── Custom Event ───────────────────────────────────────────────────────────
  async trackEvent(options) {
    if (!isValidEventName(options.eventName)) {
      this.logger.warn(
        "trackEvent: invalid event name \u2014 use lowercase alphanumeric, _ or -, max 64 chars:",
        options.eventName
      );
      return;
    }
    if (!isValidUrl(options.url)) {
      this.logger.warn("trackEvent: invalid url", options.url);
      return;
    }
    const sanitized = sanitizeProps(options.props);
    if (sanitized === null) {
      this.logger.warn("trackEvent: props validation failed, event dropped");
      return;
    }
    const event = {
      ...this.buildBase(options),
      type: "event",
      event_name: options.eventName,
      props: sanitized
    };
    await this.queue.enqueue(event);
    this.logger.log("Tracked event:", options.eventName, sanitized);
  }
  // ─── Identify ───────────────────────────────────────────────────────────────
  async identify(options) {
    if (!options.userId || typeof options.userId !== "string") {
      this.logger.warn("identify: userId is required");
      return;
    }
    if (!isValidUrl(options.url)) {
      this.logger.warn("identify: invalid url", options.url);
      return;
    }
    const sanitized = sanitizeProps(options.traits);
    const event = {
      ...this.buildBase(options),
      type: "identify",
      traits: {
        user_id: options.userId,
        ...sanitized
      }
    };
    await this.queue.enqueue(event);
    this.logger.log("Identified user:", options.userId);
  }
  // ─── Payment ────────────────────────────────────────────────────────────────
  async trackPayment(options) {
    if (!options.revenue || typeof options.revenue.amount !== "number") {
      this.logger.warn("trackPayment: revenue.amount is required");
      return;
    }
    if (!options.revenue.currency) {
      this.logger.warn("trackPayment: revenue.currency is required");
      return;
    }
    const event = {
      ...this.buildBase(options),
      type: "payment",
      revenue: options.revenue
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
  async trackRefund(options) {
    if (!options.revenue || typeof options.revenue.amount !== "number") {
      this.logger.warn("trackRefund: revenue.amount is required");
      return;
    }
    const event = {
      ...this.buildBase(options),
      type: "refund",
      revenue: options.revenue
    };
    await this.queue.enqueue(event);
    this.logger.log("Tracked refund:", options.revenue.amount, options.revenue.currency);
  }
  // ─── Queue management ───────────────────────────────────────────────────────
  async flush() {
    this.logger.log("Manual flush triggered");
    return this.queue.flush();
  }
  async shutdown() {
    this.logger.log("Shutting down \u2014 flushing remaining events");
    return this.queue.shutdown();
  }
  get queueSize() {
    return this.queue.size;
  }
  // ─── Private ────────────────────────────────────────────────────────────────
  buildBase(options) {
    return {
      website_id: this.websiteId,
      visitor_id: options.visitorId,
      session_id: options.sessionId,
      type: "pageview",
      // overridden by caller
      url: options.url,
      hostname: options.hostname ?? extractHostname(options.url),
      referrer: options.referrer ?? null,
      title: options.title,
      language: options.language,
      timezone: options.timezone,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      screen_w: options.screen?.w,
      screen_h: options.screen?.h,
      viewport_w: options.viewport?.w,
      viewport_h: options.viewport?.h
    };
  }
};

// src/webhooks/stripe.ts
async function handleStripeWebhook(client, event, options = {}) {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/stripe";
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.payment_status !== "paid" && session.mode !== "subscription") {
          return { tracked: false, eventType: event.type, provider: "stripe", error: "Payment not completed" };
        }
        const amount = session.amount_total ? normalizeAmount(session.amount_total, session.currency ?? "usd") : 0;
        const email = session.customer_email ?? session.customer_details?.email ?? void 0;
        const revenue = {
          amount,
          currency: (session.currency ?? "usd").toUpperCase(),
          provider: "stripe",
          provider_id: session.id,
          email,
          payment_type: session.subscription ? "subscription" : "one_time",
          plan: session.metadata?.plan
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "stripe", amount, currency: revenue.currency, email };
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const amount = normalizeAmount(invoice.amount_paid, invoice.currency);
        const email = invoice.customer_email ?? void 0;
        const revenue = {
          amount,
          currency: invoice.currency.toUpperCase(),
          provider: "stripe",
          provider_id: invoice.id,
          email,
          payment_type: "subscription",
          plan: invoice.metadata?.plan
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "stripe", amount, currency: revenue.currency, email };
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const amount = normalizeAmount(charge.amount_refunded, charge.currency);
        const email = charge.receipt_email ?? void 0;
        const revenue = {
          amount,
          currency: charge.currency.toUpperCase(),
          provider: "stripe",
          provider_id: charge.id,
          email
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
function parseStripeWebhook(rawBody, signature, webhookSecret, stripe) {
  if (!stripe) {
    throw new Error("Stripe instance is required for signature verification");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

// src/webhooks/lemonsqueezy.ts
async function handleLemonSqueezyWebhook(client, event, options = {}) {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/lemonsqueezy";
  const eventName = event.meta.event_name;
  try {
    switch (eventName) {
      case "order_created": {
        const order = { data: event.data };
        const attrs = order.data.attributes;
        const amount = attrs.total / 100;
        const revenue = {
          amount,
          currency: attrs.currency.toUpperCase(),
          provider: "lemonsqueezy",
          provider_id: String(order.data.id),
          email: attrs.user_email,
          payment_type: "one_time",
          plan: attrs.first_order_item?.product_name,
          order_id: String(attrs.order_number)
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: eventName, provider: "lemonsqueezy", amount, currency: revenue.currency, email: attrs.user_email };
      }
      case "subscription_payment_success": {
        const sub = { data: event.data };
        const attrs = sub.data.attributes;
        const amount = attrs.total / 100;
        const revenue = {
          amount,
          currency: attrs.currency.toUpperCase(),
          provider: "lemonsqueezy",
          provider_id: String(sub.data.id),
          email: attrs.user_email,
          payment_type: "subscription"
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: eventName, provider: "lemonsqueezy", amount, currency: revenue.currency, email: attrs.user_email };
      }
      case "order_refunded": {
        const order = { data: event.data };
        const attrs = order.data.attributes;
        const amount = attrs.total / 100;
        const revenue = {
          amount,
          currency: attrs.currency.toUpperCase(),
          provider: "lemonsqueezy",
          provider_id: String(order.data.id),
          email: attrs.user_email
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

// src/webhooks/polar.ts
async function handlePolarWebhook(client, event, options = {}) {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/polar";
  try {
    switch (event.type) {
      case "checkout.created":
      case "checkout.updated": {
        const checkout = event.data;
        if (checkout.status !== "succeeded") {
          return { tracked: false, eventType: event.type, provider: "polar", error: "Checkout not succeeded" };
        }
        const amount = checkout.amount ? normalizeAmount(checkout.amount, checkout.currency ?? "usd") : 0;
        const email = checkout.customer_email ?? void 0;
        const revenue = {
          amount,
          currency: (checkout.currency ?? "usd").toUpperCase(),
          provider: "polar",
          provider_id: checkout.id,
          email,
          payment_type: "one_time",
          plan: checkout.product?.name
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "polar", amount, currency: revenue.currency, email };
      }
      case "subscription.active":
      case "subscription.updated": {
        const sub = event.data;
        const amount = sub.amount ? normalizeAmount(sub.amount, sub.currency ?? "usd") : 0;
        const email = sub.user?.email ?? void 0;
        const revenue = {
          amount,
          currency: (sub.currency ?? "usd").toUpperCase(),
          provider: "polar",
          provider_id: sub.id,
          email,
          payment_type: "subscription"
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.type, provider: "polar", amount, currency: revenue.currency, email };
      }
      case "subscription.canceled":
      case "subscription.revoked": {
        const sub = event.data;
        const amount = sub.amount ? normalizeAmount(sub.amount, sub.currency ?? "usd") : 0;
        const revenue = {
          amount,
          currency: (sub.currency ?? "usd").toUpperCase(),
          provider: "polar",
          provider_id: sub.id,
          email: sub.user?.email ?? void 0,
          payment_type: "subscription"
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

// src/webhooks/paddle.ts
async function handlePaddleWebhook(client, event, options = {}) {
  const visitorId = options.visitorId ?? "server";
  const sessionId = options.sessionId ?? "server";
  const url = options.url ?? "https://server/webhook/paddle";
  try {
    switch (event.event_type) {
      case "transaction.completed": {
        const tx = event.data;
        if (tx.status !== "completed") {
          return { tracked: false, eventType: event.event_type, provider: "paddle", error: "Transaction not completed" };
        }
        const rawAmount = tx.details?.totals?.total;
        const currency = tx.details?.totals?.currency_code ?? "USD";
        const amount = rawAmount ? parseInt(rawAmount, 10) / 100 : 0;
        const email = tx.customer?.email ?? void 0;
        const revenue = {
          amount,
          currency: currency.toUpperCase(),
          provider: "paddle",
          provider_id: tx.id,
          email,
          payment_type: "one_time",
          plan: tx.custom_data?.plan
        };
        await client.trackPayment({ url, visitorId, sessionId, revenue });
        return { tracked: true, eventType: event.event_type, provider: "paddle", amount, currency, email };
      }
      case "transaction.refunded": {
        const tx = event.data;
        const rawAmount = tx.details?.totals?.total;
        const currency = tx.details?.totals?.currency_code ?? "USD";
        const amount = rawAmount ? parseInt(rawAmount, 10) / 100 : 0;
        const revenue = {
          amount,
          currency: currency.toUpperCase(),
          provider: "paddle",
          provider_id: tx.id,
          email: tx.customer?.email ?? void 0
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

// src/index.ts
function createAnalytics(config) {
  return new AnalyticsClient(config);
}

exports.AnalyticsClient = AnalyticsClient;
exports.EventQueue = EventQueue;
exports.createAnalytics = createAnalytics;
exports.extractHostname = extractHostname;
exports.generateId = generateId;
exports.handleLemonSqueezyWebhook = handleLemonSqueezyWebhook;
exports.handlePaddleWebhook = handlePaddleWebhook;
exports.handlePolarWebhook = handlePolarWebhook;
exports.handleStripeWebhook = handleStripeWebhook;
exports.isValidEventName = isValidEventName;
exports.normalizeAmount = normalizeAmount;
exports.parseStripeWebhook = parseStripeWebhook;
exports.sanitizeProps = sanitizeProps;
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map