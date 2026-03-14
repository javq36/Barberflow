import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, parseJwtExpMs } from "@/lib/config/auth";
import { fetchApi } from "@/lib/server/api-proxy";

type RouteContext = {
  params: { path?: string[] } | Promise<{ path?: string[] }>;
};

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
  "x-request-id",
  "x-correlation-id",
] as const;

function buildForwardHeaders(
  request: NextRequest,
  token: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "x-forwarded-host": request.nextUrl.host,
    "x-forwarded-proto": request.nextUrl.protocol.replace(":", ""),
  };

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers[headerName] = value;
    }
  }

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    headers["x-forwarded-for"] = xForwardedFor;
  }

  return headers;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { message: "Unauthorized" },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return unauthorizedResponse();
  }

  const expiresAtMs = parseJwtExpMs(token);
  if (expiresAtMs !== null && expiresAtMs <= Date.now()) {
    const response = unauthorizedResponse();
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  const { path = [] } = await Promise.resolve(context.params);
  const targetPath = `/${path.join("/")}`;
  const requestBody =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const upstreamResponse = await fetchApi(
    targetPath,
    {
      method: request.method,
      headers: buildForwardHeaders(request, token),
      body: requestBody,
    },
    request.nextUrl.search,
  );

  const payload = await upstreamResponse.text();
  return new NextResponse(payload, {
    status: upstreamResponse.status,
    headers: {
      "content-type":
        upstreamResponse.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
