import { NextRequest, NextResponse } from "next/server";
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

function buildForwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
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

async function proxyPublicRequest(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { path = [] } = await Promise.resolve(context.params);
  const targetPath = `/public/${path.join("/")}`;
  const requestBody =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const upstreamResponse = await fetchApi(
    targetPath,
    {
      method: request.method,
      headers: buildForwardHeaders(request),
      body: requestBody,
    },
    request.nextUrl.search,
  );

  if (
    upstreamResponse.status === 204 ||
    upstreamResponse.status === 205 ||
    upstreamResponse.status === 304
  ) {
    return new NextResponse(null, {
      status: upstreamResponse.status,
      headers: {
        "cache-control": "no-store",
      },
    });
  }

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

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyPublicRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyPublicRequest(request, context);
}
