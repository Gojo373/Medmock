import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

type ProxyClientFactory = (
  url: string,
  anonKey: string,
  options: {
    cookies: {
      getAll: () => Array<{ name: string; value: string }>;
      setAll: (cookies: CookieToSet[]) => void;
    };
  },
) => { auth: { getUser(): Promise<unknown> } };

export async function refreshSupabaseSession(
  request: NextRequest,
  dependencies: {
    createClient?: ProxyClientFactory;
    environment: { url: string; anonKey: string };
  },
) {
  let response = NextResponse.next({ request });
  const createClient =
    dependencies.createClient ??
    (createServerClient as unknown as ProxyClientFactory);
  const client = createClient(
    dependencies.environment.url,
    dependencies.environment.anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies) {
          for (const cookie of cookies) {
            request.cookies.set(cookie.name, cookie.value);
          }
          response = NextResponse.next({ request });
          for (const cookie of cookies) {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
        },
      },
    },
  );

  await client.auth.getUser();
  return response;
}
