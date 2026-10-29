import { NextRequest, NextResponse } from "next/server";

import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(request: NextRequest) {
  try {
    const { client, applyCookies } = createSupabaseRouteClient(request);
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      logServerEvent("warn", "auth.google_rejected", { code: error?.code });
      return NextResponse.redirect(new URL("/sign-in?error=oauth", origin));
    }

    return applyCookies(NextResponse.redirect(data.url));
  } catch {
    logServerEvent("error", "auth.google_failed");
    return NextResponse.redirect(new URL("/sign-in?error=service", request.url));
  }
}
