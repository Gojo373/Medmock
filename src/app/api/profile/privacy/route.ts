import { z } from "zod";

import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const PrivacySchema = z.object({ hideDisplayName: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PrivacySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_privacy_request" }, { status: 400 });
  }

  try {
    const client = createSupabaseAdminClient();
    const { error } = await client
      .from("profiles")
      .update({ hide_display_name: parsed.data.hideDisplayName })
      .eq("id", user.id);

    if (error) throw error;
    return Response.json({ hideDisplayName: parsed.data.hideDisplayName });
  } catch {
    logServerEvent("error", "profile.privacy_failed", { userId: user.id });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
