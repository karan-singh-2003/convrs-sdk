import { randomUUID } from "crypto";

// ─── Logger ────────────────────────────────────────────────────────────────────

export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createLogger(debug: boolean): Logger {
  return {
    log: (...args) => { if (debug) console.log("[Analytics]", ...args); },
    warn: (...args) => { if (debug) console.warn("[Analytics]", ...args); },
    error: (...args) => console.error("[Analytics]", ...args),
  };
}

// ─── IDs ───────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return randomUUID();
}

export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function isValidEventName(name: unknown): name is string {
  if (!name || typeof name !== "string") return false;
  if (name.length === 0 || name.length > 64) return false;
  return /^[a-z0-9_-]+$/i.test(name);
}

export function isValidUrl(url: unknown): url is string {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ─── Props Sanitization ────────────────────────────────────────────────────────
// Max 10 properties, keys alphanumeric/underscore/hyphen ≤32 chars,
// values coerced to string ≤255 chars, basic XSS chars stripped.

export function sanitizeProps(
  props: Record<string, unknown> | undefined
): Record<string, string> | null {
  if (!props) return {};
  if (typeof props !== "object" || Array.isArray(props)) return {};

  const out: Record<string, string> = {};
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
    val = val
      .replace(/[<>'"&]/g, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+=/gi, "")
      .trim();

    out[key.toLowerCase()] = val;
  }

  return out;
}

// ─── Currency normalization ────────────────────────────────────────────────────
// Some providers send amounts in cents (Stripe), others in dollars (LemonSqueezy).

export function normalizeAmount(amount: number, currency: string): number {
  // Stripe sends in smallest unit (cents). We store as float dollars.
  const zerDecimalCurrencies = ["JPY", "KRW", "VND", "BIF", "CLP", "GNF",
    "MGA", "PYG", "RWF", "UGX", "XAF", "XOF", "XPF"];

  if (zerDecimalCurrencies.includes(currency.toUpperCase())) {
    return amount; // already whole units
  }

  // If amount looks like it's in cents (large integer), convert to dollars
  if (Number.isInteger(amount) && amount > 100) {
    return amount / 100;
  }

  return amount;
}

// ─── Hostname extraction ───────────────────────────────────────────────────────

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}