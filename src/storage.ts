
// src/web/storage.ts
var COOKIE_KEYS = {
  datafast_visitor_id: 365,
  datafast_session_id: 1 / 48,
  // 30 minutes
  datafast_session_start: 1 / 48
  // 30 minutes
};
function isCookieKey(key: string) {
  return key in COOKIE_KEYS;
}
var COOKIELESS_SESSION_KEYS = {
  datafast_visitor_id: true,
  datafast_session_id: true,
  datafast_session_start: true
};
function isCookielessSessionKey(key: string) {
  return key in COOKIELESS_SESSION_KEYS;
}
function createLocalStorageAdapter() {
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
    }
  };
}
function createMemoryStorageAdapter() {
  const storage = /* @__PURE__ */ new Map();
  return {
    async getItem(key: string) {
      return storage.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      storage.set(key, value);
    },
    async removeItem(key: string) {
      storage.delete(key);
    }
  };
}
function createCookielessWebStorageAdapter(_domain: string) {
  const localAdapter = createLocalStorageAdapter();
  const memorySession = /* @__PURE__ */ new Map();
  function sessionGet(key: string) {
    try {
      const v = sessionStorage.getItem(key);
      if (v) return v;
    } catch {
    }
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
    } catch {
    }
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
    }
  };
}
function createHybridStorageAdapter(domain: string) {
  const localAdapter = createLocalStorageAdapter();
  return {
    async getItem(key: string) {
      if (isCookieKey(key)) {
        const cookieVal = getCookie(key);
        if (cookieVal) return cookieVal;
        const localVal = await localAdapter.getItem(key);
        if (localVal) {
          setCookie(key, localVal, (COOKIE_KEYS as any)[key], domain);
          try {
            localStorage.removeItem(key);
          } catch {
          }
        }
        return localVal;
      }
      return localAdapter.getItem(key);
    },
    async setItem(key: string, value: string) {
      if (isCookieKey(key)) {
        setCookie(key, value, (COOKIE_KEYS as any)[key], domain);
        try {
          localStorage.removeItem(key);
        } catch {
        }
        return;
      }
      return localAdapter.setItem(key, value);
    },
    async removeItem(key: string) {
      if (isCookieKey(key)) {
        deleteCookie(key, domain);
        try {
          localStorage.removeItem(key);
        } catch {
        }
        return;
      }
      return localAdapter.removeItem(key);
    }
  };
}