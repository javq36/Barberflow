import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AuthRole,
  parseJwtBarbershopId,
  parseJwtExpMs,
  parseJwtRole,
} from "@/lib/config/auth";

type SessionResponse = {
  authenticated: boolean;
  expiresAtMs: number | null;
  role: AuthRole | null;
  barbershopId: string | null;
};

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json<SessionResponse>(
      {
        authenticated: false,
        expiresAtMs: null,
        role: null,
        barbershopId: null,
      },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const expiresAtMs = parseJwtExpMs(token);
  if (expiresAtMs !== null && expiresAtMs <= Date.now()) {
    const response = NextResponse.json<SessionResponse>(
      {
        authenticated: false,
        expiresAtMs,
        role: null,
        barbershopId: null,
      },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
        },
      },
    );

    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  const role = parseJwtRole(token);
  const barbershopId = parseJwtBarbershopId(token);

  return NextResponse.json<SessionResponse>(
    {
      authenticated: true,
      expiresAtMs,
      role,
      barbershopId,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
