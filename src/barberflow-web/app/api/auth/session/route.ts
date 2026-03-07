import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, parseJwtExpMs } from "@/lib/config/auth";

type SessionResponse = {
  authenticated: boolean;
  expiresAtMs: number | null;
};

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json<SessionResponse>(
      { authenticated: false, expiresAtMs: null },
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
      { authenticated: false, expiresAtMs },
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

  return NextResponse.json<SessionResponse>(
    {
      authenticated: true,
      expiresAtMs,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
