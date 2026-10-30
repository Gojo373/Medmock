import type { ProviderSelection } from "@/features/imports/schema";

export type ImportStatus =
  | "uploading"
  | "uploaded"
  | "extracting"
  | "review_required"
  | "ready_to_publish"
  | "published"
  | "failed";

export type ImportJob = {
  id: string;
  status: ImportStatus;
  providerSelection: ProviderSelection;
  reviewFlagCount: number;
  error?: string;
};

export type ImportEvent =
  | { type: "START_EXTRACTION" }
  | { type: "EXTRACTION_COMPLETED"; reviewFlagCount: number }
  | { type: "COMPLETE_REVIEW" }
  | { type: "PUBLISH" }
  | { type: "FAIL"; error: string };

export function transitionImport(job: ImportJob, event: ImportEvent): ImportJob {
  if (event.type === "FAIL") {
    return { ...job, status: "failed", error: event.error };
  }

  if (event.type === "START_EXTRACTION" && job.status === "uploaded") {
    return { ...job, status: "extracting", error: undefined };
  }

  if (event.type === "EXTRACTION_COMPLETED" && job.status === "extracting") {
    return {
      ...job,
      status: "review_required",
      reviewFlagCount: event.reviewFlagCount,
    };
  }

  if (event.type === "COMPLETE_REVIEW" && job.status === "review_required") {
    return { ...job, status: "ready_to_publish", reviewFlagCount: 0 };
  }

  if (event.type === "PUBLISH" && job.status === "review_required") {
    throw new Error("Review must be completed before publishing.");
  }

  if (event.type === "PUBLISH" && job.status === "ready_to_publish") {
    return { ...job, status: "published" };
  }

  throw new Error("Invalid import workflow transition.");
}
