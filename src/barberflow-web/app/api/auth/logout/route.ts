import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/config/auth";

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    },
  );

  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
