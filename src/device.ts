
// src/web/device.ts
export function getDeviceInfo() {
  const getViewport = () => {
    if (typeof window === "undefined") return { width: 0, height: 0 };
    return {
      width: window.innerWidth || 0,
      height: window.innerHeight || 0
    };
  };
  const getScreenSize = () => {
    if (typeof window === "undefined" || !window.screen) return { width: 0, height: 0 };
    return {
      width: window.screen.width || 0,
      height: window.screen.height || 0
    };
  };
  const getLanguage = () => {
    if (typeof navigator === "undefined") return "en";
    return navigator.language || "en";
  };
  const getTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  };
  const getUserAgent = () => {
    if (typeof navigator === "undefined") return "Unknown";
    return navigator.userAgent || "Unknown";
  };
  const viewport = getViewport();
  const screen = getScreenSize();
  return {
    platform: "web",
    osVersion: getUserAgent(),
    deviceModel: "Browser",
    appVersion: "1.0.0",
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewport,
    language: getLanguage(),
    timezone: getTimezone()
  };
}
export function onViewportChange(callback: (viewport: { width: number; height: number }) => void) {
  if (typeof window === "undefined") {
    return () => {
    };
  }
  const handleResize = () => {
    callback({
      width: window.innerWidth || 0,
      height: window.innerHeight || 0
    });
  };
  window.addEventListener("resize", handleResize);
  return () => {
    window.removeEventListener("resize", handleResize);
  };
}
