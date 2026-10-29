import { NextRequest, NextResponse } from "next/server";

import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
  }

  try {
    const { client, applyCookies } = createSupabaseRouteClient(request);
    const { error } = await client.auth.exchangeCodeForSession(code);

    if (error) {
      logServerEvent("warn", "auth.callback_rejected", { code: error.code });
      return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
    }

    return applyCookies(NextResponse.redirect(new URL(next, request.url)));
  } catch {
    logServerEvent("error", "auth.callback_failed");
    return NextResponse.redirect(new URL("/sign-in?error=service", request.url));
  }
}
