import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, parseJwtExpMs } from "@/lib/config/auth";
import { fetchApi } from "@/lib/server/api-proxy";

type LoginRequest = {
  email: string;
  password: string;
};

type LoginResponse = {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    barbershopId?: string;
  };
};

function buildResponse(
  payload: string,
  status: number,
  contentType?: string | null,
) {
  return new NextResponse(payload, {
    status,
    headers: {
      "content-type": contentType ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginRequest;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchApi("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown upstream error";
    return NextResponse.json(
      {
        message: `No se pudo conectar con la API (${errorMessage}).`,
      },
      {
        status: 502,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const contentType = upstreamResponse.headers.get("content-type");
  const rawPayload = await upstreamResponse.text();

  if (!upstreamResponse.ok) {
    return buildResponse(rawPayload, upstreamResponse.status, contentType);
  }

  const payload = JSON.parse(rawPayload) as LoginResponse;
  const expMs = parseJwtExpMs(payload.accessToken);

  const response = NextResponse.json(
    {
      tokenType: payload.tokenType,
      expiresAt: payload.expiresAt,
      user: payload.user,
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: payload.accessToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(expMs ? { expires: new Date(expMs) } : {}),
  });

  return response;
}
