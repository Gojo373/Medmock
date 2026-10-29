import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }

  return value;
}

export function supabasePublicEnvironment() {
  return {
    url: requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

export function hasSupabaseServerConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

export function createSupabaseAuthClient(accessToken: string): SupabaseClient {
  const environment = supabasePublicEnvironment();

  return createClient(
    environment.url,
    environment.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    },
  );
}
