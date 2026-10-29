import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { supabasePublicEnvironment } from "@/lib/supabase/server";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function createSupabaseRouteClient(request: NextRequest) {
  const environment = supabasePublicEnvironment();
  const pendingCookies: PendingCookie[] = [];
  const client = createServerClient(environment.url, environment.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        pendingCookies.push(...cookies);
      },
    },
  });

  return {
    client,
    applyCookies(response: NextResponse) {
      for (const cookie of pendingCookies) {
        response.cookies.set(cookie.name, cookie.value, cookie.options);
      }

      return response;
    },
  };
}
