import type { PaperVersion } from "@/features/exam/domain";
import type { PublishImportRequest } from "@/features/imports/contracts";
import {
  applyReviewDecisions,
  applyReviewEdits,
  buildPublishedPaperVersionsFromImport,
  normalizeOptionalHindiReviewFlags,
  type ReviewDecision,
  type ReviewFieldEdit,
  validateImportForPublish,
} from "@/features/imports/reconciliation";
import type { ReconciledImport } from "@/features/imports/schema";

export type ImportReviewRecord = {
  status: "review_required" | "ready_to_publish" | "published";
  reconciled: ReconciledImport;
  reviewed?: ReconciledImport;
  sources?: ImportReviewSource[];
  publishedOriginalVersionId?: string;
  publishedCurrentVersionId?: string;
};

export type ImportReviewSource = {
  kind: "paper" | "answer_key" | "solution";
  fileName: string;
  downloadUrl: string;
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
  edits: ReviewFieldEdit[] = [],
) {
  const record = await repository.get(importId);
  if (!record) throw new Error("Import was not found.");
  if (record.status === "published") throw new Error("Published imports cannot be changed.");

  const edited = applyReviewEdits(record.reviewed ?? record.reconciled, edits);
  const reviewed = applyReviewDecisions(edited, decisions);
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
  const originalId = `${request.paperId}-original-r${request.originalRevision}`;
  const currentId = `${request.paperId}-current-r${request.currentRevision}`;
  if (record.status === "published") {
    if (
      record.publishedOriginalVersionId === originalId &&
      record.publishedCurrentVersionId === currentId
    ) {
      return {
        originalVersionId: originalId,
        currentVersionId: currentId,
      };
    }
    throw new Error("Import was already published with different versions.");
  }
  if (!record.reviewed) {
    throw new Error("Import is not ready to publish.");
  }

  const reviewed = normalizeOptionalHindiReviewFlags(record.reviewed);
  const validation = validateImportForPublish(reviewed);
  if (!validation.canPublish) throw new Error("Import is not ready to publish.");
  if (record.status !== "ready_to_publish") {
    await repository.saveReview(importId, reviewed, true);
  }

  const versions = buildPublishedPaperVersionsFromImport(reviewed, {
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
