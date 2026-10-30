import { z } from "zod";

import { createImportJob } from "@/features/imports/server/import-job-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const ProviderSchema = z.enum(["openai", "gemini", "both"]);
const maximumBytes = 50 * 1024 * 1024;
const UploadFileSchema = z
  .object({
    kind: z.enum(["paper", "answer_key", "solution"]),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    size: z.number().int().positive().max(maximumBytes),
  })
  .strict();
const UploadRegistrationSchema = z
  .object({
    providerSelection: ProviderSchema,
    files: z.array(UploadFileSchema).min(1).max(3),
  })
  .strict()
  .superRefine((value, context) => {
    const kinds = value.files.map((file) => file.kind);
    if (kinds.filter((kind) => kind === "paper").length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "Exactly one question paper is required.",
      });
    }
    if (new Set(kinds).size !== kinds.length) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "Each source role may be registered once.",
      });
    }
  });

function extensionFor(file: z.infer<typeof UploadFileSchema>) {
  if (file.mimeType === "application/pdf") return "pdf";
  if (file.mimeType === "image/png") return "png";
  return file.fileName.toLowerCase().endsWith(".jpeg") ? "jpeg" : "jpg";
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const registration = UploadRegistrationSchema.safeParse(payload);
  if (!registration.success) {
    return Response.json({ error: "invalid_import_upload" }, { status: 400 });
  }

  let jobId: string | undefined;
  try {
    const client = createSupabaseAdminClient();
    const job = await createImportJob(
      registration.data.providerSelection,
      user.id,
      "uploading",
    );
    jobId = job.id;
    const fileRows: Array<Record<string, string>> = [];
    const uploads: Array<{ kind: string; uploadUrl: string }> = [];

    for (const file of registration.data.files) {
      const storagePath = `${user.id}/${job.id}/${file.kind}.${extensionFor(file)}`;
      const { data: signed, error: signedError } = await client.storage
        .from("paper-imports")
        .createSignedUploadUrl(storagePath, { upsert: false });
      if (signedError) throw signedError;
      fileRows.push({
        import_id: job.id,
        storage_path: storagePath,
        file_name: file.fileName,
        mime_type: file.mimeType,
        kind: file.kind,
      });
      uploads.push({ kind: file.kind, uploadUrl: signed.signedUrl });
    }

    const { error: fileError } = await client.from("import_files").insert(fileRows);
    if (fileError) throw fileError;

    logServerEvent("info", "import.upload_registered", {
      importId: job.id,
      ownerId: user.id,
    });
    return Response.json(
      { importId: job.id, status: "uploading", uploads },
      { status: 201 },
    );
  } catch {
    const client = createSupabaseAdminClient();
    if (jobId) await client.from("import_jobs").delete().eq("id", jobId);
    logServerEvent("error", "import.upload_registration_failed", {
      ownerId: user.id,
    });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
