import { APP_STORAGE_KEYS } from "@/lib/config/app";

type AuthSession = {
  accessToken: string | null;
  expiresAtIso: string | null;
  expiresAtMs: number | null;
  isAuthenticated: boolean;
  wasExpired: boolean;
};

function parseJwtExpMs(accessToken: string): number | null {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as { exp?: number };

    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function parseIsoDateToMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? null : date;
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(APP_STORAGE_KEYS.AccessToken);
  window.localStorage.removeItem(APP_STORAGE_KEYS.AccessTokenExpiresAt);
}

export function saveAuthSession(accessToken: string, expiresAtIso: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_STORAGE_KEYS.AccessToken, accessToken);
  window.localStorage.setItem(
    APP_STORAGE_KEYS.AccessTokenExpiresAt,
    expiresAtIso,
  );
}

export function getAuthSession(): AuthSession {
  if (typeof window === "undefined") {
    return {
      accessToken: null,
      expiresAtIso: null,
      expiresAtMs: null,
      isAuthenticated: false,
      wasExpired: false,
    };
  }

  const accessToken = window.localStorage.getItem(APP_STORAGE_KEYS.AccessToken);
  const expiresAtIso = window.localStorage.getItem(
    APP_STORAGE_KEYS.AccessTokenExpiresAt,
  );

  if (!accessToken) {
    return {
      accessToken: null,
      expiresAtIso: null,
      expiresAtMs: null,
      isAuthenticated: false,
      wasExpired: false,
    };
  }

  const expiresAtMs =
    parseIsoDateToMs(expiresAtIso) ?? parseJwtExpMs(accessToken);
  const isExpired = expiresAtMs !== null && expiresAtMs <= Date.now();

  if (isExpired) {
    clearAuthSession();
    return {
      accessToken: null,
      expiresAtIso: null,
      expiresAtMs: null,
      isAuthenticated: false,
      wasExpired: true,
    };
  }

  return {
    accessToken,
    expiresAtIso,
    expiresAtMs,
    isAuthenticated: true,
    wasExpired: false,
  };
}
