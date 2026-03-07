import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, parseJwtExpMs } from "@/lib/config/auth";
import { fetchApi } from "@/lib/server/api-proxy";

type RouteContext = {
  params: { path?: string[] } | Promise<{ path?: string[] }>;
};

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
      headers: {
        Authorization: `Bearer ${token}`,
        ...(request.headers.get("content-type")
          ? { "content-type": request.headers.get("content-type") as string }
          : {}),
      },
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
