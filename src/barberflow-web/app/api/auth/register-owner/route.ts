import { NextRequest, NextResponse } from "next/server";
import { fetchApi } from "@/lib/server/api-proxy";

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
  const body = await request.text();

  const upstreamResponse = await fetchApi("/auth/register-owner", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
  });

  const payload = await upstreamResponse.text();
  return buildResponse(
    payload,
    upstreamResponse.status,
    upstreamResponse.headers.get("content-type"),
  );
}
