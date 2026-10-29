import type { ImportJob } from "@/features/imports/state-machine";
import type { ProviderSelection } from "@/features/imports/schema";
import {
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

const globalImportState = globalThis as typeof globalThis & {
  medmockImportJobs?: Map<string, ImportJob>;
};

const jobs = globalImportState.medmockImportJobs ?? new Map<string, ImportJob>();

if (process.env.NODE_ENV !== "production") {
  globalImportState.medmockImportJobs = jobs;
}

export async function createImportJob(
  providerSelection: ProviderSelection,
  ownerId: string,
) {
  if (process.env.NODE_ENV !== "test") {
    const client = createSupabaseAdminClient();
    const { data, error } = await client
      .from("import_jobs")
      .insert({
        owner_id: ownerId,
        provider_selection: providerSelection,
        status: "uploaded",
        review_flag_count: 0,
      })
      .select("id, status, provider_selection, review_flag_count")
      .single();

    if (error) throw error;

    return {
      id: data.id as string,
      status: data.status as ImportJob["status"],
      providerSelection: data.provider_selection as ProviderSelection,
      reviewFlagCount: data.review_flag_count as number,
    };
  }

  const job: ImportJob = {
    id: crypto.randomUUID(),
    status: "uploaded",
    providerSelection,
    reviewFlagCount: 0,
  };

  jobs.set(job.id, job);
  return job;
}

export function getImportJob(importId: string) {
  if (process.env.NODE_ENV !== "test") {
    return getPersistentImportJob(importId);
  }

  return jobs.get(importId);
}

async function getPersistentImportJob(importId: string) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("import_jobs")
    .select("id, status, provider_selection, review_flag_count")
    .eq("id", importId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return undefined;

  return {
    id: data.id as string,
    status: data.status as ImportJob["status"],
    providerSelection: data.provider_selection as ProviderSelection,
    reviewFlagCount: data.review_flag_count as number,
  };
}
