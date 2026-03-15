import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  parseJwtBarbershopId,
  parseJwtExpMs,
} from "@/lib/config/auth";
import { createClient } from "@supabase/supabase-js";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_BUCKET = "service-images";

function unauthorizedResponse() {
  return NextResponse.json(
    { message: "Unauthorized" },
    {
      status: 401,
      headers: { "cache-control": "no-store" },
    },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { message },
    {
      status: 400,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function POST(request: NextRequest) {
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

  const barbershopId = parseJwtBarbershopId(token);
  if (!barbershopId) {
    return badRequest("Missing barbershop context.");
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { message: "Supabase Storage is not configured on server." },
      {
        status: 500,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return badRequest("Image file is required.");
  }

  if (!file.type.startsWith("image/")) {
    return badRequest("Only image files are supported.");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return badRequest("Image is too large. Max size is 5MB.");
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET;
  const extension = file.name.includes(".")
    ? (file.name.split(".").pop() ?? "jpg").toLowerCase()
    : "jpg";
  const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
  const objectPath = `${barbershopId}/services/${crypto.randomUUID()}.${safeExtension}`;

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        message: uploadError.message || "Could not upload image to storage.",
      },
      {
        status: 500,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(objectPath);

  return NextResponse.json(
    {
      url: publicUrl,
      path: objectPath,
      bucket,
    },
    {
      status: 201,
      headers: { "cache-control": "no-store" },
    },
  );
}
