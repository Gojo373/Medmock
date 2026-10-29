import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createSupabaseAuthClient,
  supabasePublicEnvironment,
} from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  role: "admin" | "student";
};

async function userFromClient(
  client: SupabaseClient,
  accessToken?: string,
): Promise<AuthenticatedUser | null> {
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) return null;

  return {
    id: data.user.id,
    role: profile.role === "admin" ? "admin" : "student",
  };
}

export async function getRequestUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  if (process.env.NODE_ENV === "test") {
    const id = request.headers.get("x-medmock-user-id")?.trim();
    const role = request.headers.get("x-medmock-role")?.trim();

    if (!id || (role !== "admin" && role !== "student")) return null;

    return { id, role };
  }

  try {
    const authorization = request.headers.get("authorization");

    if (authorization?.startsWith("Bearer ")) {
      const accessToken = authorization.slice("Bearer ".length).trim();
      if (!accessToken) return null;

      return userFromClient(createSupabaseAuthClient(accessToken), accessToken);
    }

    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;

    const environment = supabasePublicEnvironment();
    const cookies = parseCookieHeader(cookieHeader).map(({ name, value }) => ({
      name,
      value: value ?? "",
    }));
    const client = createServerClient(environment.url, environment.anonKey, {
      cookies: {
        getAll: () => cookies,
        setAll: () => undefined,
      },
    });

    return userFromClient(client);
  } catch {
    return null;
  }
}

