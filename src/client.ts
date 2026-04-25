// src/core/client.ts
import { EventQueue } from "./queue";
import {
  createLogger,
  buildUserAgent,
  buildWebPageHref,
  buildScreenHref,
  extractAdClickIds,
  generateVisitorId,
  generateSessionId,
  isValidVisitorId,
  isValidSessionId,
  isSessionExpired,
  isValidEventName,
  sanitizeCustomProperties,
} from "./utils";

const SDK_VERSION = "1.0.0";
const DEFAULT_API_URL = "https://datafa.st/api/events";

const STORAGE_KEYS = {
  VISITOR_ID: "_atk_vid",
  SESSION_ID: "_atk_sid",
  SESSION_START: "datafast_session_start",
  IGNORE_TRACKING: "datafast_ignore",
};

function computeOrigin(config: any): string | undefined {
  if (config.platform === "web") return undefined;

  if (config.origin && config.origin.trim()) {
    const o = config.origin.trim();
    return /^https?:\/\//i.test(o) ? o : `https://${o}`;
  }

  const domain = config.domain;
  if (/^https?:\/\//i.test(domain)) return domain;

  const isLocalhost =
    domain === "localhost" ||
    domain.startsWith("127.") ||
    domain.startsWith("192.168.") ||
    domain.startsWith("10.") ||
    domain.startsWith("::1");

  const protocol = isLocalhost ? "http" : "https";
  return `${protocol}://${domain}`;
}

export class DataFastClient {
  private state: any;
  private queue: EventQueue | null;
  private logger: any;

  constructor() {
    this.state = {
      initialized: false,
      visitorId: null,
      sessionId: null,
      sessionStartTime: null,
      lastScreenName: null,
      lastPageviewUrl: null,
      lastPageviewTime: null,
      config: null,
      deviceInfo: null,
    };
    this.queue = null;
    this.logger = createLogger(false);
  }

  async init(config: any) {
    if (this.state.initialized) {
      this.logger.warn("SDK already initialized");
      return;
    }

    if (!config.appId) throw new Error("[DataFast] appId is required");
    if (!config.domain) throw new Error("[DataFast] domain is required");
    if (!config.storage) throw new Error("[DataFast] storage adapter is required");
    if (!config.platform) throw new Error("[DataFast] platform is required");

    this.state.config = config;
    this.logger = createLogger(config.debug ?? false);

    const ignoreTracking = await config.storage.getItem(STORAGE_KEYS.IGNORE_TRACKING);
    if (ignoreTracking === "true") {
      this.logger.log("Tracking disabled via user opt-out");
      return;
    }

    await this.initVisitorId();
    await this.initSessionId();

    if (config.cookieless && this.state.visitorId) {
      config.onCookielessVisitorId?.(this.state.visitorId);
    }

    const apiUrl = config.apiUrl ?? DEFAULT_API_URL;
    const origin = computeOrigin(config);
    const userAgent = buildUserAgent(
      SDK_VERSION,
      config.platform,
      config.osVersion ?? "0.0",
      "Unknown"
    );

    this.queue = new EventQueue({
      storage: config.storage,
      network: config.network,
      apiUrl,
      userAgent,
      origin,
      flushInterval: config.flushInterval,
      maxQueueSize: config.maxQueueSize,
      onFlushError: (error: any, event: any) => {
        this.logger.error("Failed to send event:", error, event.payload.type);
      },
      onSuccessfulSend: (_payload: any, parsedBody: any) => {
        void this.onEventSendSuccess(parsedBody);
      },
    });

    await this.queue.init();
    this.state.initialized = true;
    this.logger.log("SDK initialized", {
      visitorId: this.state.visitorId,
      sessionId: this.state.sessionId,
    });
  }

  async trackScreen(screenName: string, options?: { href?: string }) {
    if (!this.isReady()) return;

    if (!screenName || typeof screenName !== "string") {
      this.logger.warn("trackScreen requires a screen name");
      return;
    }

    const config = this.state.config;
    const payload = this.buildBasePayload("pageview", screenName, options?.href);
    const DEDUP_MS = 60000;

    if (
      this.state.lastPageviewUrl === payload.href &&
      this.state.lastPageviewTime &&
      Date.now() - this.state.lastPageviewTime < DEDUP_MS
    ) {
      this.logger.log("Pageview throttled (same URL within 60s):", payload.href);
      return;
    }

    let referrer: string | null = null;

    if (this.state.lastScreenName) {
      referrer =
        config.platform === "web"
          ? buildWebPageHref(config.domain, this.state.lastScreenName)
          : buildScreenHref(config.platform, this.state.lastScreenName, config.domain);
    } else if (
      config.platform === "web" &&
      typeof document !== "undefined" &&
      document.referrer
    ) {
      referrer = document.referrer;
    }

    payload.referrer = referrer;
    await this.queue!.enqueue(payload);

    this.state.lastScreenName = screenName;
    this.state.lastPageviewUrl = payload.href;
    this.state.lastPageviewTime = Date.now();
    this.logger.log("Screen tracked:", screenName);
  }

  async track(eventName: string, properties?: Record<string, any>) {
    if (!this.isReady()) return;

    if (!isValidEventName(eventName)) {
      this.logger.warn(
        "Invalid event name. Use lowercase alphanumeric with _ or -, max 64 chars:",
        eventName
      );
      return;
    }

    const sanitized = sanitizeCustomProperties(properties ?? {});
    if (sanitized === null) {
      this.logger.warn("Custom properties validation failed");
      return;
    }

    const screenName = this.state.lastScreenName ?? "Unknown";
    const payload = this.buildBasePayload("custom", screenName);
    payload.extraData = { eventName: eventName.toLowerCase(), ...sanitized };

    await this.queue!.enqueue(payload);
    this.logger.log("Event tracked:", eventName, sanitized);
  }

  async identify(userId: string, properties?: Record<string, any>) {
    if (!this.isReady()) return;

    if (!userId || typeof userId !== "string") {
      this.logger.warn("identify requires a user_id");
      return;
    }

    const screenName = this.state.lastScreenName ?? "Unknown";
    const payload = this.buildBasePayload("identify", screenName);
    payload.extraData = {
      user_id: userId,
      name: properties?.name ?? "",
      image: properties?.image ?? "",
      ...properties,
    };

    await this.queue!.enqueue(payload);
    this.logger.log("User identified:", userId);
  }

  async trackPayment(data: any) {
    if (!this.isReady()) return;

    const hasIdentifier =
      (typeof data.email === "string" && data.email.length > 0) ||
      (typeof data.stripe_session_id === "string" && data.stripe_session_id.length > 0) ||
      (typeof data.lemonsqueezy_order_id === "string" && data.lemonsqueezy_order_id.length > 0) ||
      (typeof data.polar_checkout_id === "string" && data.polar_checkout_id.length > 0) ||
      (typeof data.paddle_transaction_id === "string" && data.paddle_transaction_id.length > 0);

    if (!hasIdentifier) {
      this.logger.warn(
        "trackPayment requires one of: email, stripe_session_id, lemonsqueezy_order_id, polar_checkout_id, paddle_transaction_id"
      );
      return;
    }

    const screenName = this.state.lastScreenName ?? "Unknown";
    const payload = this.buildBasePayload("payment", screenName);
    payload.extraData = {
      ...(data.email && { email: data.email }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.currency && { currency: data.currency }),
      ...(data.stripe_session_id && { stripe_session_id: data.stripe_session_id }),
      ...(data.lemonsqueezy_order_id && { lemonsqueezy_order_id: data.lemonsqueezy_order_id }),
      ...(data.polar_checkout_id && { polar_checkout_id: data.polar_checkout_id }),
      ...(data.paddle_transaction_id && { paddle_transaction_id: data.paddle_transaction_id }),
    };

    await this.queue!.enqueue(payload);
    this.logger.log("Payment tracked");
  }

  async trackExternalLink(url: string, text?: string) {
    if (!this.isReady()) return;

    if (!url || typeof url !== "string") {
      this.logger.warn("trackExternalLink requires a URL");
      return;
    }

    const screenName = this.state.lastScreenName ?? "Unknown";
    const payload = this.buildBasePayload("external_link", screenName);
    payload.extraData = { url, ...(text && { text }) };

    await this.queue!.enqueue(payload);
    this.logger.log("External link tracked:", url);
  }

  async flush() {
    if (this.queue) await this.queue.flush();
  }

  async resetSession() {
    if (!this.state.config) return;

    const newSessionId = generateSessionId();
    const now = Date.now();

    this.state.sessionId = newSessionId;
    this.state.sessionStartTime = now;
    this.state.lastScreenName = null;
    this.state.lastPageviewUrl = null;
    this.state.lastPageviewTime = null;

    await this.state.config.storage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    await this.state.config.storage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
    this.logger.log("Session reset:", newSessionId);
  }

  async reset() {
    if (!this.state.config) return;

    const cookieless = !!this.state.config.cookieless;
    const newSessionId = generateSessionId();
    const now = Date.now();
    let newVisitorIdForLog = null;

    if (cookieless) {
      this.state.visitorId = null;
      await this.state.config.storage.removeItem(STORAGE_KEYS.VISITOR_ID);
      this.state.config.onCookielessVisitorId?.("");
    } else {
      const newVisitorId = generateVisitorId();
      newVisitorIdForLog = newVisitorId;
      this.state.visitorId = newVisitorId;
      await this.state.config.storage.setItem(STORAGE_KEYS.VISITOR_ID, newVisitorId);
    }

    this.state.sessionId = newSessionId;
    this.state.sessionStartTime = now;
    this.state.lastScreenName = null;
    this.state.lastPageviewUrl = null;
    this.state.lastPageviewTime = null;

    await this.state.config.storage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    await this.state.config.storage.setItem(STORAGE_KEYS.SESSION_START, now.toString());

    if (this.queue) await this.queue.clear();
    this.logger.log("Visitor reset:", cookieless ? "cookieless" : newVisitorIdForLog);
  }

  async optOut() {
    if (!this.state.config) return;

    await this.state.config.storage.setItem(STORAGE_KEYS.IGNORE_TRACKING, "true");
    this.state.initialized = false;

    if (this.queue) {
      await this.queue.clear();
      await this.queue.shutdown();
    }

    this.logger.log("User opted out of tracking");
  }

  async optIn() {
    if (!this.state.config) return;
    await this.state.config.storage.removeItem(STORAGE_KEYS.IGNORE_TRACKING);
    this.logger.log("User opted back into tracking. Call init() to restart.");
  }

  setDeviceInfo(info: any) {
    this.state.deviceInfo = {
      platform: info.platform ?? this.state.config?.platform ?? "ios",
      osVersion: info.osVersion ?? "0.0",
      deviceModel: info.deviceModel ?? "Unknown",
      appVersion: info.appVersion ?? this.state.config?.appVersion ?? "1.0.0",
      screenWidth: info.screenWidth ?? 0,
      screenHeight: info.screenHeight ?? 0,
      viewport: info.viewport ?? { width: 0, height: 0 },
      language: info.language ?? "en",
      timezone: info.timezone ?? "UTC",
    };
  }

  getVisitorId() { return this.state.visitorId; }
  getSessionId() { return this.state.sessionId; }
  isInitialized() { return this.state.initialized; }
  isCookieless() { return !!this.state.config?.cookieless; }

  async shutdown() {
    if (this.queue) await this.queue.shutdown();
    this.state.initialized = false;
  }

  private isReady() {
    if (!this.state.initialized) {
      this.logger.warn("SDK not initialized. Call init() first.");
      return false;
    }
    return true;
  }

  private async initVisitorId() {
    const config = this.state.config;

    if (config.cookieless) {
      const stored = await config.storage.getItem(STORAGE_KEYS.VISITOR_ID);
      this.state.visitorId = stored && stored.length > 0 ? stored : null;
      return;
    }

    let visitorId = await config.storage.getItem(STORAGE_KEYS.VISITOR_ID);
    if (!visitorId || !isValidVisitorId(visitorId)) {
      visitorId = generateVisitorId();
      await config.storage.setItem(STORAGE_KEYS.VISITOR_ID, visitorId);
    }
    this.state.visitorId = visitorId;
  }

  private async initSessionId() {
    const config = this.state.config;

    let sessionId = await config.storage.getItem(STORAGE_KEYS.SESSION_ID);
    const sessionStartStr = await config.storage.getItem(STORAGE_KEYS.SESSION_START);
    const sessionStart = sessionStartStr ? parseInt(sessionStartStr, 10) : 0;

    const sessionInvalid = !sessionId || !isValidSessionId(sessionId);
    const expired = !config.cookieless && isSessionExpired(sessionStart);

    if (sessionInvalid || expired) {
      sessionId = generateSessionId();
      const now = Date.now();
      await config.storage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
      await config.storage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
      this.state.sessionStartTime = now;
    } else {
      this.state.sessionStartTime = sessionStart;
    }

    this.state.sessionId = sessionId;
  }

  private async onEventSendSuccess(parsedBody: any) {
    if (!this.state.config?.cookieless) return;
    if (!parsedBody || typeof parsedBody !== "object") return;

    const vid = parsedBody.visitorId;
    if (typeof vid !== "string" || !vid) return;

    this.state.visitorId = vid;
    await this.state.config.storage.setItem(STORAGE_KEYS.VISITOR_ID, vid);
    this.state.config.onCookielessVisitorId?.(vid);
    this.logger.log("Cookieless visitor id from server", vid);
  }

  private buildBasePayload(type: string, screenName: string, hrefOverride?: string): any {
    const config = this.state.config;
    const deviceInfo = this.state.deviceInfo;

    const href =
      hrefOverride ??
      (config.platform === "web"
        ? buildWebPageHref(config.domain, screenName)
        : buildScreenHref(config.platform, screenName, config.domain));

    const adClickIds =
      config.platform === "web" ? extractAdClickIds(href) : undefined;

    const payload: any = {
      websiteId: config.appId,
      domain: config.domain,
      // ✅ Fixed: use stored visitorId, not a new random one each time
      visitorId: this.state.visitorId ?? null,
      sessionId: this.state.sessionId,
      href,
      referrer: null,
      type,
      viewport: deviceInfo?.viewport ?? { width: 0, height: 0 },
      language: deviceInfo?.language ?? "en",
      timezone: deviceInfo?.timezone ?? "UTC",
      screenWidth: deviceInfo?.screenWidth ?? 0,
      screenHeight: deviceInfo?.screenHeight ?? 0,
      device: deviceInfo
        ? { platform: deviceInfo.platform, osVersion: deviceInfo.osVersion, model: deviceInfo.deviceModel }
        : undefined,
    };

    if (config.cookieless) payload.cookieless = true;
    if (adClickIds) payload.adClickIds = adClickIds;

    return payload;
  }
}

let instance: DataFastClient | null = null;

export function getDataFastClient(): DataFastClient {
  if (!instance) instance = new DataFastClient();
  return instance;
}

export function createDataFastClient(): DataFastClient {
  return new DataFastClient();
}