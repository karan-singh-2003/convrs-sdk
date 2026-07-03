type HeartbeatOptions = {
  endpoint: string;
  websiteId: string;
  getVisitorId: () => string | null;
  getSessionId: () => string | null;
  enabled: () => boolean;
};

function isCrossOrigin(url: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function startHeartbeat({ endpoint, websiteId, getVisitorId, getSessionId, enabled }: HeartbeatOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let interval: ReturnType<typeof setInterval> | null = null;

  const sendHeartbeat = () => {
    if (!enabled()) return;
    if (document.hidden) return;

    const body = JSON.stringify({
      workspaceId: websiteId,
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      page: window.location.pathname,
      url: window.location.href,
    });

    try {
      if (typeof navigator.sendBeacon === "function" && !isCrossOrigin(endpoint)) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
    } catch {}
  };

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      sendHeartbeat();
    }
  };

  const handleBeforeUnload = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  sendHeartbeat();
  interval = setInterval(sendHeartbeat, 10000);

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}