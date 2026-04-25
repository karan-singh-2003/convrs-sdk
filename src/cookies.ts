import { isLocalhostHostname } from "./bot";
// src/web/cookies.ts
export function setCookie(name: string, value: string, days?: number, domain?: string) {
  let expires = "";
  if (days) {
    const date = /* @__PURE__ */ new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1e3);
    expires = "; expires=" + date.toUTCString();
  }
  let cookieStr = name + "=" + encodeURIComponent(value) + expires + "; path=/";
  if (!isLocalhostHostname(window.location.hostname) && window.location.protocol !== "file:") {
    const currentHostname = window.location.hostname;
    const isMainDomainOrSubdomain = currentHostname === domain || currentHostname.endsWith("." + domain);
    if (isMainDomainOrSubdomain && domain) {
      cookieStr += "; domain=." + domain.replace(/^\./, "");
    } else {
      cookieStr += "; domain=." + currentHostname.replace(/^\./, "");
    }
  }
  document.cookie = cookieStr;
}
export function getCookie(name: string): string | null {
  const nameEQ = name + "=";
  const cookies = document.cookie.split(";");
  for (let i = 0; i < cookies.length; i++) {
    let c = cookies[i];
    while (c.charAt(0) === " ") c = c.substring(1);
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length));
    }
  }
  return null;
}
export function deleteCookie(name: string, domain?: string): void {
  setCookie(name, "", -1, domain);
}