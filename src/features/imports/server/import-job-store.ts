import type { ImportJob } from "@/features/imports/state-machine";
import type { ProviderSelection } from "@/features/imports/schema";

const globalImportState = globalThis as typeof globalThis & {
  medmockImportJobs?: Map<string, ImportJob>;
};

const jobs = globalImportState.medmockImportJobs ?? new Map<string, ImportJob>();

if (process.env.NODE_ENV !== "production") {
  globalImportState.medmockImportJobs = jobs;
}

export function createImportJob(providerSelection: ProviderSelection) {
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
  return jobs.get(importId);
}
