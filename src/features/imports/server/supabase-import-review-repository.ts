import type { SupabaseClient } from "@supabase/supabase-js";

import type { PaperVersion } from "@/features/exam/domain";
import type {
  ImportReviewRecord,
  ImportReviewRepository,
} from "@/features/imports/server/import-review-service";
import { ReconciledImportSchema, type ReconciledImport } from "@/features/imports/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ReviewRow = {
  status: ImportReviewRecord["status"];
  reconciled_document: unknown;
  reviewed_document: unknown;
};

export class SupabaseImportReviewRepository implements ImportReviewRepository {
  constructor(private readonly client: SupabaseClient = createSupabaseAdminClient()) {}

  async get(importId: string) {
    const { data, error } = await this.client
      .from("import_jobs")
      .select("status, reconciled_document, reviewed_document")
      .eq("id", importId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;

    const row = data as ReviewRow;
    if (!row.reconciled_document) return undefined;
    return {
      status: row.status,
      reconciled: ReconciledImportSchema.parse(row.reconciled_document),
      ...(row.reviewed_document
        ? { reviewed: ReconciledImportSchema.parse(row.reviewed_document) }
        : {}),
    };
  }

  async saveReview(
    importId: string,
    reviewed: ReconciledImport,
    readyToPublish: boolean,
  ) {
    const { error } = await this.client
      .from("import_jobs")
      .update({
        reviewed_document: reviewed,
        review_flag_count: reviewed.reviewFlags.filter((flag) => !flag.resolved).length,
        status: readyToPublish ? "ready_to_publish" : "review_required",
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId)
      .neq("status", "published");
    if (error) throw error;
  }

  async publish(
    importId: string,
    adminId: string,
    versions: { original: PaperVersion; current: PaperVersion },
  ) {
    const { error } = await this.client.rpc("publish_import_versions", {
      p_import_id: importId,
      p_admin_id: adminId,
      p_paper_id: versions.original.paperId,
      p_original_version: versions.original,
      p_current_version: versions.current,
    });
    if (error) throw error;
  }
}
