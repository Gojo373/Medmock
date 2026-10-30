import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ClaimedImportJob,
  ImportProcessingRepository,
  StoredImportFile,
} from "@/features/imports/server/import-processor";
import type { ExtractionDocument, ReconciledImport } from "@/features/imports/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ImportJobRow = {
  id: string;
  provider_selection: ClaimedImportJob["providerSelection"];
  processing_attempts: number;
};

type ImportFileRow = {
  id: string;
  import_id: string;
  storage_path: string;
  file_name: string;
  mime_type: StoredImportFile["mimeType"];
  kind: StoredImportFile["kind"];
};

export class SupabaseImportProcessingRepository implements ImportProcessingRepository {
  constructor(private readonly client: SupabaseClient = createSupabaseAdminClient()) {}

  async claimNext(workerId: string, leaseSeconds: number) {
    const { data, error } = await this.client.rpc("claim_import_job", {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as ImportJobRow | null;
    if (!row) return undefined;
    return {
      id: row.id,
      providerSelection: row.provider_selection,
      processingAttempts: row.processing_attempts,
    };
  }

  async listFiles(importId: string) {
    const { data, error } = await this.client
      .from("import_files")
      .select("id, import_id, storage_path, file_name, mime_type, kind")
      .eq("import_id", importId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return ((data ?? []) as ImportFileRow[]).map((row) => ({
      id: row.id,
      importId: row.import_id,
      storagePath: row.storage_path,
      fileName: row.file_name,
      mimeType: row.mime_type,
      kind: row.kind,
    }));
  }

  async downloadFile(file: StoredImportFile) {
    const { data, error } = await this.client.storage
      .from("paper-imports")
      .download(file.storagePath);
    if (error) throw error;
    return new File([data], file.fileName, { type: file.mimeType });
  }

  async completeExtraction(
    importId: string,
    documents: ExtractionDocument[],
    reconciled: ReconciledImport,
  ) {
    const reviewFlagCount = reconciled.reviewFlags.filter((flag) => !flag.resolved).length;
    const { error } = await this.client
      .from("import_jobs")
      .update({
        status: "review_required",
        extraction_document: documents,
        reconciled_document: reconciled,
        reviewed_document: null,
        review_flag_count: reviewFlagCount,
        error_code: null,
        error_detail: null,
        lease_owner: null,
        lease_expires_at: null,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId);
    if (error) throw error;
  }

  async fail(importId: string, code: string, detail: string) {
    const { error } = await this.client
      .from("import_jobs")
      .update({
        status: "failed",
        error_code: code,
        error_detail: detail.slice(0, 2_000),
        lease_owner: null,
        lease_expires_at: null,
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", importId);
    if (error) throw error;
  }
}
