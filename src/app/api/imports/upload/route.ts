import { z } from "zod";

import { createImportJob } from "@/features/imports/server/import-job-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const ProviderSchema = z.enum(["openai", "gemini", "both"]);
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maximumBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const paper = form?.get("paper");
  const provider = ProviderSchema.safeParse(form?.get("providerSelection"));

  if (
    !(paper instanceof File) ||
    !provider.success ||
    !allowedTypes.has(paper.type) ||
    paper.size === 0 ||
    paper.size > maximumBytes
  ) {
    return Response.json({ error: "invalid_import_upload" }, { status: 400 });
  }

  const extension = paper.name.split(".").pop()?.toLowerCase() || "bin";
  const storagePath = `${user.id}/${crypto.randomUUID()}/paper.${extension}`;

  try {
    const client = createSupabaseAdminClient();
    const { error: uploadError } = await client.storage
      .from("paper-imports")
      .upload(storagePath, await paper.arrayBuffer(), {
        contentType: paper.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const job = await createImportJob(provider.data, user.id);
    const { error: fileError } = await client.from("import_files").insert({
      import_id: job.id,
      storage_path: storagePath,
      file_name: paper.name,
      mime_type: paper.type,
      kind: "paper",
    });
    if (fileError) throw fileError;

    logServerEvent("info", "import.uploaded", {
      importId: job.id,
      ownerId: user.id,
    });
    return Response.json({ importId: job.id, status: job.status }, { status: 202 });
  } catch {
    logServerEvent("error", "import.upload_failed", { ownerId: user.id });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
