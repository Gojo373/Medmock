import { NextRequest, NextResponse } from "next/server";

import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";
import { safeReturnDestination } from "@/lib/auth/return-destination";

export async function GET(request: NextRequest) {
  const next = safeReturnDestination(request.nextUrl.searchParams.get("next"));
  try {
    const { client, applyCookies } = createSupabaseRouteClient(request);
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      logServerEvent("warn", "auth.google_rejected", { code: error?.code });
      return NextResponse.redirect(new URL(`/sign-in?error=oauth&next=${encodeURIComponent(next)}`, origin));
    }

    return applyCookies(NextResponse.redirect(data.url));
  } catch {
    logServerEvent("error", "auth.google_failed");
    return NextResponse.redirect(new URL(`/sign-in?error=service&next=${encodeURIComponent(next)}`, request.url));
  }
}
