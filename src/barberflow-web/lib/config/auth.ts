export const AUTH_COOKIE_NAME = "bf_access_token";

export type AuthRole = "SuperAdmin" | "Owner" | "Barber" | "Customer" | "Unknown";

type JwtPayload = {
  exp?: number;
  role?: string;
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"?: string;
  barbershop_id?: string;
};

function decodeBase64(value: string) {
  if (typeof atob === "function") {
    return atob(value);
  }

  return Buffer.from(value, "base64").toString("utf-8");
}

export function parseJwtExpMs(accessToken: string): number | null {
  try {
    const decoded = parseJwtPayload(accessToken);
    if (!decoded) {
      return null;
    }

    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function parseJwtPayload(accessToken: string): JwtPayload | null {
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(decodeBase64(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

export function parseJwtRole(accessToken: string): AuthRole {
  const payload = parseJwtPayload(accessToken);
  const rawRole =
    payload?.role ?? payload?.["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

  if (rawRole === "SuperAdmin" || rawRole === "Owner" || rawRole === "Barber" || rawRole === "Customer") {
    return rawRole;
  }

  return "Unknown";
}

export function parseJwtBarbershopId(accessToken: string): string | null {
  const payload = parseJwtPayload(accessToken);
  return payload?.barbershop_id ?? null;
}
