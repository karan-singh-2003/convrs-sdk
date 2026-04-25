
// src/web/bot.ts
function isLikelyBot(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  try {
    const nav = window.navigator;
    if (
      nav.webdriver === true ||
      (window as any).callPhantom ||
      (window as any)._phantom ||
      (window as any).__nightmare
    ) {
      return true;
    }
    if (!nav.userAgent || nav.userAgent === "" || nav.userAgent === "undefined" || nav.userAgent.length < 5) {
      return true;
    }
    const ua = nav.userAgent.toLowerCase();
    const headlessPatterns = [
      "headlesschrome",
      "phantomjs",
      "selenium",
      "webdriver",
      "puppeteer",
      "playwright"
    ];
    if (headlessPatterns.some((p) => ua.includes(p))) return true;
    const automationGlobals = [
      "__webdriver_evaluate",
      "__selenium_evaluate",
      "__webdriver_script_function",
      "__webdriver_unwrapped",
      "__fxdriver_evaluate",
      "__driver_evaluate",
      "_Selenium_IDE_Recorder",
      "_selenium",
      "calledSelenium",
      "$cdc_asdjflasutopfhvcZLmcfl_"
    ];
    const win = window;
    if (automationGlobals.some((g) => (win as any)[g] !== void 0)) return true;
    const docEl = document.documentElement;
    if (docEl && (docEl.getAttribute("webdriver") || docEl.getAttribute("selenium") || docEl.getAttribute("driver"))) {
      return true;
    }
    const toolPatterns = [
      "python",
      "curl",
      "wget",
      "java/",
      "go-http",
      "node.js",
      "axios",
      "postman"
    ];
    if (toolPatterns.some((p) => ua.includes(p))) return true;
  } catch {
    return false;
  }
  return false;
}
function isInIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window !== window.parent;
  } catch {
    return true;
  }
}
function isLocalhostHostname(hostname?: string): boolean {
  const h = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")).toLowerCase();
  if (!h) return false;
  if (["localhost", "127.0.0.1", "::1"].includes(h)) return true;
  if (/^127(\.\d+){0,3}$/.test(h)) return true;
  if (/^(\[)?::1?\]?$/.test(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
  return false;
}
function isFileProtocol(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "file:";
}
