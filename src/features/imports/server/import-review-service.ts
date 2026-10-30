import type { PaperVersion } from "@/features/exam/domain";
import type { PublishImportRequest } from "@/features/imports/contracts";
import {
  applyReviewDecisions,
  buildPublishedPaperVersionsFromImport,
  type ReviewDecision,
  validateImportForPublish,
} from "@/features/imports/reconciliation";
import type { ReconciledImport } from "@/features/imports/schema";

export type ImportReviewRecord = {
  status: "review_required" | "ready_to_publish" | "published";
  reconciled: ReconciledImport;
  reviewed?: ReconciledImport;
};

export interface ImportReviewRepository {
  get(importId: string): Promise<ImportReviewRecord | undefined>;
  saveReview(
    importId: string,
    reviewed: ReconciledImport,
    readyToPublish: boolean,
  ): Promise<void>;
  publish(
    importId: string,
    adminId: string,
    versions: { original: PaperVersion; current: PaperVersion },
  ): Promise<void>;
}

export async function reviewImport(
  repository: ImportReviewRepository,
  importId: string,
  decisions: ReviewDecision[],
) {
  const record = await repository.get(importId);
  if (!record) throw new Error("Import was not found.");
  if (record.status === "published") throw new Error("Published imports cannot be changed.");

  const reviewed = applyReviewDecisions(
    record.reviewed ?? record.reconciled,
    decisions,
  );
  const validation = validateImportForPublish(reviewed);
  await repository.saveReview(importId, reviewed, validation.canPublish);

  return {
    reviewed,
    canPublish: validation.canPublish,
    issues: validation.issues,
  };
}

export async function publishReviewedImport(
  repository: ImportReviewRepository,
  importId: string,
  adminId: string,
  request: PublishImportRequest,
  publishedAt = new Date().toISOString(),
) {
  if (!request.approved) throw new Error("Explicit approval is required.");
  const record = await repository.get(importId);
  if (!record) throw new Error("Import was not found.");
  if (record.status !== "ready_to_publish" || !record.reviewed) {
    throw new Error("Import is not ready to publish.");
  }

  const validation = validateImportForPublish(record.reviewed);
  if (!validation.canPublish) throw new Error("Import is not ready to publish.");

  const originalId = `${request.paperId}-original-r${request.originalRevision}`;
  const currentId = `${request.paperId}-current-r${request.currentRevision}`;
  const versions = buildPublishedPaperVersionsFromImport(record.reviewed, {
    paperId: request.paperId,
    originalId,
    originalRevision: request.originalRevision,
    currentId,
    currentRevision: request.currentRevision,
    publishedAt,
  });

  await repository.publish(importId, adminId, versions);
  return {
    originalVersionId: versions.original.id,
    currentVersionId: versions.current.id,
  };
}
