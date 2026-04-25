// src/utils.ts

export function generateVisitorId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}

export function generateSessionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}

export function isValidVisitorId(id: string): boolean {
  if (!id || typeof id !== "string" || id.length !== 36) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function isValidSessionId(id: string): boolean {
  if (!id || typeof id !== "string" || id.length !== 37) return false;
  return /^s[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function buildScreenHref(platform: string, screenName: string, domain?: string): string {
  const normalizedName = screenName.replace(/^\/+/, "").trim();
  if (domain) {
    const protocol = domain === "localhost" || domain.startsWith("127.") ? "http" : "https";
    return `${protocol}://${domain}/__app/${platform}/${normalizedName}`;
  }
  return `datafast://${platform}/${normalizedName}`;
}

export function buildWebPageHref(domain: string, path: string): string {
  const normalizedPath = path.replace(/^\/+/, "").trim();
  const pathPart = normalizedPath ? `/${normalizedPath}` : "";
  const protocol = domain === "localhost" || domain.startsWith("127.") ? "http" : "https";
  return `${protocol}://${domain}${pathPart}`;
}

export function buildUserAgent(
  sdkVersion: string,
  platform: string,
  osVersion: string,
  deviceModel: string
): string {
  if (platform === "ios") {
    const osVer = osVersion.replace(/\./g, "_");
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${osVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) DataFast/${sdkVersion} Mobile`;
  }
  if (platform === "android") {
    return `Mozilla/5.0 (Linux; Android ${osVersion}; ${deviceModel}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36`;
  }
  return `Mozilla/5.0 (compatible; DataFast/${sdkVersion})`;
}

export function isValidEventName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.length === 0 || name.length > 64) return false;
  return /^[a-z0-9_-]+$/.test(name.toLowerCase());
}

export function sanitizeCustomProperties(
  properties: Record<string, any>
): Record<string, string> | null {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }

  const sanitized: Record<string, string> = {};
  const entries = Object.entries(properties);

  if (entries.length > 10) {
    console.warn("[DataFast] Maximum 10 custom properties allowed");
    return null;
  }

  for (const [key, value] of entries) {
    if (key === "eventName") continue;

    if (!key || typeof key !== "string" || key.length > 64) {
      console.warn(`[DataFast] Invalid property name: ${key}`);
      return null;
    }

    if (!/^[a-z0-9_-]+$/i.test(key)) {
      console.warn(`[DataFast] Property name must be alphanumeric with _ or -: ${key}`);
      return null;
    }

    let stringValue = value == null ? "" : String(value);
    if (stringValue.length > 255) stringValue = stringValue.substring(0, 255);

    stringValue = stringValue
      .replace(/[<>'"&]/g, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+=/gi, "")
      .trim();

    sanitized[key.toLowerCase()] = stringValue;
  }

  return sanitized;
}

export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function isSessionExpired(sessionStartTime: number): boolean {
  const SESSION_TTL_MS = 30 * 60 * 1000;
  return Date.now() - sessionStartTime > SESSION_TTL_MS;
}

const AD_CLICK_PARAM_KEYS = [
  "gclid", "gclsrc", "wbraid", "gbraid",
  "li_fat_id", "fbclid", "msclkid", "ttclid", "twclid",
];

export function extractAdClickIds(href: string): Record<string, string> | undefined {
  if (!href || typeof href !== "string") return undefined;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    const out: Record<string, string> = {};
    for (const key of AD_CLICK_PARAM_KEYS) {
      const v = url.searchParams.get(key);
      if (v) out[key] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export function createLogger(debug: boolean) {
  return {
    log: (...args: any[]) => { if (debug) console.log("[DataFast]", ...args); },
    warn: (...args: any[]) => { if (debug) console.warn("[DataFast]", ...args); },
    error: (...args: any[]) => { console.error("[DataFast]", ...args); },
  };
}