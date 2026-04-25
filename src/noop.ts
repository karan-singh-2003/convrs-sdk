// src/web/noop.ts
const noop = async (): Promise<void> => {};
function createNoopClient(reason: string, debug?: boolean) {
  if (debug) {
    console.warn(`[DataFast] Tracking disabled: ${reason}`);
  }
  return {
    init: noop,
    trackScreen: noop,
    trackPageview: noop,
    track: noop,
    identify: noop,
    trackPayment: noop,
    trackExternalLink: noop,
    flush: noop,
    resetSession: noop,
    reset: noop,
    optOut: noop,
    optIn: noop,
    shutdown: noop,
    setDeviceInfo: (_info: any) => {
    },
    getVisitorId: () => null,
    getSessionId: () => null,
    isCookieless: () => false,
    isInitialized: () => false,
    getTrackingParams: () => ({ _df_vid: "", _df_sid: "" }),
    buildCrossDomainUrl: (url: string) => url
  };
}