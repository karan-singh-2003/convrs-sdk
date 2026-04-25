// src/web/storage.ts
import { getCookie, setCookie, deleteCookie } from "./cookies";

const SESSION_KEY = "_atk_sid";
const VISITOR_KEY = "_atk_vid";
const SESSION_START_KEY = "_atk_sstart";

// cookie TTL (days)
const COOKIE_KEYS: Record<string, number> = {
  [VISITOR_KEY]: 365,
  [SESSION_KEY]: 1 / 48,        // 30 minutes
  [SESSION_START_KEY]: 1 / 48,  // 30 minutes
};

function isCookieKey(key: string): boolean {
  return key in COOKIE_KEYS;
}

const COOKIELESS_SESSION_KEYS: Record<string, boolean> = {
  [VISITOR_KEY]: true,
  [SESSION_KEY]: true,
  [SESSION_START_KEY]: true,
};

function isCookielessSessionKey(key: string): boolean {
  return key in COOKIELESS_SESSION_KEYS;
}

export function createLocalStorageAdapter() {
  return {
    async getItem(key: string) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.warn("[DataFast] localStorage.getItem failed:", error);
        return null;
      }
    },
    async setItem(key: string, value: string) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.warn("[DataFast] localStorage.setItem failed:", error);
      }
    },
    async removeItem(key: string) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn("[DataFast] localStorage.removeItem failed:", error);
      }
    },
  };
}

export function createMemoryStorageAdapter() {
  const storage = new Map<string, string>();
  return {
    async getItem(key: string) {
      return storage.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      storage.set(key, value);
    },
    async removeItem(key: string) {
      storage.delete(key);
    },
  };
}

export function createCookielessWebStorageAdapter(_domain?: string) {
  const localAdapter = createLocalStorageAdapter();
  const memorySession = new Map<string, string>();

  function sessionGet(key: string): string | null {
    try {
      const v = sessionStorage.getItem(key);
      if (v) return v;
    } catch {}
    return memorySession.get(key) ?? null;
  }

  function sessionSet(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
      memorySession.delete(key);
    } catch {
      memorySession.set(key, value);
    }
  }

  function sessionRemove(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
    memorySession.delete(key);
  }

  return {
    async getItem(key: string) {
      if (isCookielessSessionKey(key)) {
        const fromSession = sessionGet(key);
        if (fromSession) return fromSession;
        return memorySession.get(key) ?? null;
      }
      return localAdapter.getItem(key);
    },
    async setItem(key: string, value: string) {
      if (isCookielessSessionKey(key)) {
        sessionSet(key, value);
        return;
      }
      return localAdapter.setItem(key, value);
    },
    async removeItem(key: string) {
      if (isCookielessSessionKey(key)) {
        sessionRemove(key);
        return;
      }
      return localAdapter.removeItem(key);
    },
  };
}

export function createHybridStorageAdapter(domain: string) {
  const localAdapter = createLocalStorageAdapter();

  return {
    async getItem(key: string) {
      if (isCookieKey(key)) {
        const cookieVal = getCookie(key);
        if (cookieVal) return cookieVal;

        const localVal = await localAdapter.getItem(key);
        if (localVal) {
          setCookie(key, localVal, COOKIE_KEYS[key], domain);
          try { localStorage.removeItem(key); } catch {}
        }
        return localVal;
      }
      return localAdapter.getItem(key);
    },
    async setItem(key: string, value: string) {
      if (isCookieKey(key)) {
        setCookie(key, value, COOKIE_KEYS[key], domain);
        try { localStorage.removeItem(key); } catch {}
        return;
      }
      return localAdapter.setItem(key, value);
    },
    async removeItem(key: string) {
      if (isCookieKey(key)) {
        deleteCookie(key, domain);
        try { localStorage.removeItem(key); } catch {}
        return;
      }
      return localAdapter.removeItem(key);
    },
  };
}