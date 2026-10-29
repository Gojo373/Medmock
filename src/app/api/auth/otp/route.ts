import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseRouteClient } from "@/lib/supabase/route-client";

const RequestSchema = z.object({ email: z.string().trim().email() }).strict();

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    const { client, applyCookies } = createSupabaseRouteClient(request);
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin;
    const { error } = await client.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: `${origin}/api/auth/callback?next=/dashboard` },
    });

    if (error) {
      logServerEvent("warn", "auth.otp_rejected", { code: error.code });
      return NextResponse.json({ error: "sign_in_unavailable" }, { status: 429 });
    }

    return applyCookies(NextResponse.json({ ok: true }));
  } catch {
    logServerEvent("error", "auth.otp_failed");
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
}
