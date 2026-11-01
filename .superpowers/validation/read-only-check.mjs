import nextEnv from "@next/env";
import { existsSync } from "node:fs";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const environment = process.env;
const names = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF",
  "SUPABASE_DB_URL", "DATABASE_URL", "SUPABASE_DB_PASSWORD",
  "OPENAI_API_KEY", "OPENAI_IMPORT_MODEL", "OPENAI_IMPORTS_ENABLED",
  "GEMINI_API_KEY", "GEMINI_IMPORT_MODEL", "IMPORT_WORKER_SECRET", "CRON_SECRET",
  "E2E_AUTH_STORAGE_STATE", "E2E_PUBLISHED_PAPER_ID", "E2E_PUBLISHED_VERSION_ID",
  "VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_ORG_ID",
];
for (const name of names) {
  const value = environment[name]?.trim();
  const placeholder = value && /(?:your-|replace-with-)/.test(value);
  console.log(`${name}=${!value ? "ABSENT" : placeholder ? "PLACEHOLDER" : "PRESENT"}`);
}
console.log(`E2E_AUTH_STORAGE_STATE_FILE=${environment.E2E_AUTH_STORAGE_STATE && existsSync(environment.E2E_AUTH_STORAGE_STATE) ? "PRESENT" : "ABSENT"}`);
console.log(`configured_import_providers=${[
  ...(environment.OPENAI_API_KEY?.trim() && environment.OPENAI_IMPORTS_ENABLED === "true" ? ["openai"] : []),
  ...(environment.GEMINI_API_KEY?.trim() ? ["gemini"] : []),
].join(",") || "NONE"}`);

async function check(name, url, headers, verify = () => true) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const payload = await response.json().catch(() => undefined);
    console.log(`${name}=HTTP_${response.status}${response.ok ? verify(payload) ? " PASS" : " FAIL" : " BLOCKED"}`);
    return response.ok ? payload : undefined;
  } catch {
    console.log(`${name}=NETWORK_BLOCKED`);
    return undefined;
  }
}

const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
const anonymousKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY;
if (supabaseUrl && anonymousKey) {
  const headers = { apikey: anonymousKey, Authorization: `Bearer ${anonymousKey}` };
  const settings = await check("supabase_auth_settings", `${supabaseUrl}/auth/v1/settings`, headers);
  if (settings?.external) {
    console.log(`supabase_email_provider=${settings.external.email ? "ENABLED" : "DISABLED"}`);
    console.log(`supabase_google_provider=${settings.external.google ? "ENABLED" : "DISABLED"}`);
  }
  const publishedRows = await check("supabase_published_read", `${supabaseUrl}/rest/v1/paper_versions?select=status&limit=1`, headers,
    (rows) => Array.isArray(rows) && rows.every((row) => row.status === "published"));
  if (Array.isArray(publishedRows)) console.log(`supabase_published_fixture=${publishedRows.length ? "PRESENT" : "ABSENT"}`);
  if (serviceKey) {
    const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    await check("supabase_private_import_bucket", `${supabaseUrl}/storage/v1/bucket/paper-imports`, adminHeaders,
      (bucket) => bucket?.public === false);
    const legacyJobs = await check("supabase_agentrouter_jobs", `${supabaseUrl}/rest/v1/import_jobs?select=provider_selection&provider_selection=eq.agentrouter&limit=1`, adminHeaders);
    if (Array.isArray(legacyJobs)) console.log(`agentrouter_constraint_legacy_rows=${legacyJobs.length ? "PRESENT_BLOCKS_MIGRATION" : "ABSENT"}`);
  }
}
if (environment.OPENAI_API_KEY) {
  await check("openai_model_access", `https://api.openai.com/v1/models/${encodeURIComponent(environment.OPENAI_IMPORT_MODEL || "gpt-5-mini")}`,
    { Authorization: `Bearer ${environment.OPENAI_API_KEY}` });
}
if (environment.GEMINI_API_KEY) {
  await check("gemini_model_access", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(environment.GEMINI_IMPORT_MODEL || "gemini-3.8-flash")}`,
    { "x-goog-api-key": environment.GEMINI_API_KEY });
}
console.log(`rollback_sql_connection=${environment.SUPABASE_DB_URL || environment.DATABASE_URL ? "PRESENT" : "ABSENT_BLOCKED"}`);
console.log("live_extraction=NOT_RUN_REQUIRES_PROVIDER_UPLOAD_AND_BILLABLE_GENERATION");
