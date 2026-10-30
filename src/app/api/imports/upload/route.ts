import { z } from "zod";

import { createImportJob } from "@/features/imports/server/import-job-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const ProviderSchema = z.enum(["openai", "gemini", "both"]);
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maximumBytes = 50 * 1024 * 1024;

function validFile(value: FormDataEntryValue | null, required: boolean) {
  if (value === null && !required) return undefined;
  if (!(value instanceof File)) return null;
  if (!allowedTypes.has(value.type) || value.size === 0 || value.size > maximumBytes) {
    return null;
  }
  return value;
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const paper = validFile(form?.get("paper") ?? null, true);
  const answerKey = validFile(form?.get("answerKey") ?? null, false);
  const solution = validFile(form?.get("solution") ?? null, false);
  const provider = ProviderSchema.safeParse(form?.get("providerSelection"));

  if (
    !paper ||
    answerKey === null ||
    solution === null ||
    !provider.success ||
    !form
  ) {
    return Response.json({ error: "invalid_import_upload" }, { status: 400 });
  }

  const uploadedPaths: string[] = [];
  let jobId: string | undefined;
  try {
    const client = createSupabaseAdminClient();
    const job = await createImportJob(provider.data, user.id, "uploading");
    jobId = job.id;
    const sources = [
      { file: paper, kind: "paper" },
      ...(answerKey ? [{ file: answerKey, kind: "answer_key" }] : []),
      ...(solution ? [{ file: solution, kind: "solution" }] : []),
    ] as const;
    const fileRows = [];

    for (const source of sources) {
      const extension = source.file.name.split(".").pop()?.toLowerCase() || "bin";
      const storagePath = `${user.id}/${job.id}/${source.kind}.${extension}`;
      const { error: uploadError } = await client.storage
        .from("paper-imports")
        .upload(storagePath, await source.file.arrayBuffer(), {
          contentType: source.file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      fileRows.push({
        import_id: job.id,
        storage_path: storagePath,
        file_name: source.file.name,
        mime_type: source.file.type,
        kind: source.kind,
      });
    }

    const { error: fileError } = await client.from("import_files").insert(fileRows);
    if (fileError) throw fileError;
    const { error: readyError } = await client
      .from("import_jobs")
      .update({ status: "uploaded", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (readyError) throw readyError;

    logServerEvent("info", "import.uploaded", {
      importId: job.id,
      ownerId: user.id,
    });
    return Response.json({ importId: job.id, status: "uploaded" }, { status: 202 });
  } catch {
    const client = createSupabaseAdminClient();
    if (uploadedPaths.length > 0) {
      await client.storage.from("paper-imports").remove(uploadedPaths);
    }
    if (jobId) await client.from("import_jobs").delete().eq("id", jobId);
    logServerEvent("error", "import.upload_failed", { ownerId: user.id });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
