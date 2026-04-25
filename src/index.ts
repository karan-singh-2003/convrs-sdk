
import { createCookielessWebStorageAdapter, createHybridStorageAdapter, createLocalStorageAdapter, createMemoryStorageAdapter } from "./storage";
import { createFetchNetworkAdapter } from "./network";
import { getDeviceInfo } from "./device";
import {  setCookie, } from "./cookies";
import { onViewportChange } from "./device";
import { isLikelyBot, isInIframe, isLocalhostHostname, isFileProtocol } from "./bot";
import { createDataFastClient, getDataFastClient } from "./client";
import { createNoopClient } from "./noop";

// src/web/index.ts
let teardownAutoPageviewCapture: (() => void) | null = null;
function resolveAutoCapturePageviewsConfig(option: any) {
  if (!option) {
    return {
      enabled: false,
      trackHashChanges: false,
      captureInitialPageview: true,
      debounceMs: 100
    };
  }
  if (option === true) {
    return {
      enabled: true,
      trackHashChanges: false,
      captureInitialPageview: true,
      debounceMs: 100
    };
  }
  return {
    enabled: option.enabled ?? true,
    trackHashChanges: option.trackHashChanges ?? false,
    captureInitialPageview: option.captureInitialPageview ?? true,
    debounceMs: option.debounceMs ?? 100
  };
}
function getCurrentPagePath(trackHashChanges: boolean) {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${trackHashChanges ? hash : ""}`;
}
function setupAutoPageviewCapture(client: any, config: any) {
  if (typeof window === "undefined") return;
  if (teardownAutoPageviewCapture) {
    teardownAutoPageviewCapture();
  }
  let lastPath = getCurrentPagePath(config.trackHashChanges);
  let trackingTimeout: any = null;
  const trackIfChanged = () => {
    const nextPath = getCurrentPagePath(config.trackHashChanges);
    if (nextPath === lastPath) return;
    lastPath = nextPath;
    void client.trackPageview();
  };
  const scheduleTracking = () => {
    if (trackingTimeout) clearTimeout(trackingTimeout);
    trackingTimeout = setTimeout(trackIfChanged, config.debounceMs);
  };
  if (config.captureInitialPageview) {
    void client.trackPageview();
  }
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  window.history.pushState = function(...args) {
    originalPushState.apply(this, args);
    scheduleTracking();
  };
  window.history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    scheduleTracking();
  };
  window.addEventListener("popstate", scheduleTracking);
  if (config.trackHashChanges) {
    window.addEventListener("hashchange", scheduleTracking);
  }
  teardownAutoPageviewCapture = () => {
    if (trackingTimeout) clearTimeout(trackingTimeout);
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", scheduleTracking);
    if (config.trackHashChanges) {
      window.removeEventListener("hashchange", scheduleTracking);
    }
    teardownAutoPageviewCapture = null;
  };
}
function readCrossDomainParams() {
  try {
    const url = new URL(window.location.href);
    return {
      vid: url.searchParams.get("_df_vid"),
      sid: url.searchParams.get("_df_sid")
    };
  } catch {
    return { vid: null, sid: null };
  }
}
function cleanCrossDomainParams() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("_df_vid") || url.searchParams.has("_df_sid")) {
      url.searchParams.delete("_df_vid");
      url.searchParams.delete("_df_sid");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
  }
}
async function initDataFast(config: any) {
  const debug = config.debug ?? false;
  if (isLikelyBot()) {
    return createNoopClient("bot detected", debug);
  }
  if (isInIframe() && !config.allowIframe) {
    return createNoopClient("inside an iframe", debug);
  }
  if ((isLocalhostHostname(typeof window !== "undefined" ? window.location.hostname : "") || isFileProtocol()) && !config.allowLocalhost) {
    return createNoopClient("localhost or file:// protocol", debug);
  }
  const domain = config.domain ?? (typeof window !== "undefined" ? window.location.hostname : "unknown");
  const cookieless = config.cookieless ?? false;
  const crossDomain = readCrossDomainParams();
  if (crossDomain.vid || crossDomain.sid) {
    if (!cookieless) {
      if (crossDomain.vid) {
        setCookie("datafast_visitor_id", crossDomain.vid, 365, domain);
      }
      if (crossDomain.sid) {
        setCookie("datafast_session_id", crossDomain.sid, 1 / 48, domain);
        setCookie("datafast_session_start", Date.now().toString(), 1 / 48, domain);
      }
    }
    cleanCrossDomainParams();
  }
  let storage;
  try {
    localStorage.setItem("__datafast_test__", "test");
    localStorage.removeItem("__datafast_test__");
    storage = cookieless ? createCookielessWebStorageAdapter(domain) : createHybridStorageAdapter(domain);
  } catch {
    console.warn("[DataFast] localStorage not available, using in-memory storage");
    storage = createMemoryStorageAdapter();
  }
  const network = createFetchNetworkAdapter();
  const deviceInfo = getDeviceInfo();
  const client = getDataFastClient();
  await client.init({
    appId: config.websiteId,
    domain,
    storage,
    network,
    platform: "web",
    apiUrl: config.apiUrl,
    debug,
    flushInterval: config.flushInterval ?? 5e3,
    maxQueueSize: config.maxQueueSize ?? 10,
    cookieless,
    onCookielessVisitorId: config.onCookielessVisitorId ?? (cookieless ? (vid: string) => {
      try {
        const w = window as any;
        w.datafast = w.datafast ?? {};
        if (vid) {
          w.datafast.visitorId = vid;
        } else {
          delete w.datafast.visitorId;
        }
      } catch {
      }
    } : void 0)
  });
  client.setDeviceInfo(deviceInfo);
  onViewportChange((viewport) => {
    client.setDeviceInfo({
      ...deviceInfo,
      viewport
    });
  });
  const webClient: any = client;
  webClient.trackPageview = async (path?: string) => {
    if (path) {
      await client.trackScreen(path);
    } else {
      const href = typeof window !== "undefined" ? window.location.href : void 0;
      const pagePath = typeof window !== "undefined" ? window.location.pathname : "/";
      await client.trackScreen(pagePath, { href });
    }
  };
  webClient.getTrackingParams = (): { _df_vid: string; _df_sid: string } => {
    if (client.isCookieless()) {
      return { _df_vid: "", _df_sid: "" };
    }
    return {
      _df_vid: client.getVisitorId() ?? "",
      _df_sid: client.getSessionId() ?? ""
    };
  };
  webClient.buildCrossDomainUrl = (url: string): string => {
    if (client.isCookieless()) {
      return url;
    }
    try {
      const urlObj = new URL(url);
      const vid = client.getVisitorId();
      const sid = client.getSessionId();
      if (vid) urlObj.searchParams.set("_df_vid", vid);
      if (sid) urlObj.searchParams.set("_df_sid", sid);
      return urlObj.toString();
    } catch {
      return url;
    }
  };
  const autoCaptureConfig = resolveAutoCapturePageviewsConfig(config.autoCapturePageviews);
  if (autoCaptureConfig.enabled) {
    setupAutoPageviewCapture(webClient, autoCaptureConfig);
  } else if (teardownAutoPageviewCapture) {
    teardownAutoPageviewCapture();
  }
  return webClient;
}
async function createDataFastWithAdapters(config: any) {
  const client = createDataFastClient();
  await client.init(config);
  const deviceInfo = getDeviceInfo();
  client.setDeviceInfo(deviceInfo);
  return client;
}
async function createDataFastWeb(config: any) {
  return initDataFast(config);
}
var dataFastWeb = {
  init: initDataFast,
  createWeb: createDataFastWeb,
  getClient: getDataFastClient,
  createClient: createDataFastClient
};
var web_default = dataFastWeb;

export * from "./client";
export * from "./queue";
export * from "./utils";
export * from "./storage";
export * from "./device";
export * from "./cookies";
export * from "./bot";
export * from "./noop";
export * from "./network";

export { initDataFast };