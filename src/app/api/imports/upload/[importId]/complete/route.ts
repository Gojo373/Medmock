import { z } from "zod";

import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  const user = await getRequestUser(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { importId } = await context.params;
  if (!z.string().uuid().safeParse(importId).success) {
    return Response.json({ error: "invalid_import_id" }, { status: 400 });
  }

  try {
    const client = createSupabaseAdminClient();
    const { data: job, error: jobError } = await client
      .from("import_jobs")
      .select("id, status, owner_id")
      .eq("id", importId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return Response.json({ error: "import_not_found" }, { status: 404 });
    if (job.status !== "uploading") {
      return Response.json({ error: "import_not_uploading" }, { status: 409 });
    }

    const { data: files, error: filesError } = await client
      .from("import_files")
      .select("storage_path")
      .eq("import_id", importId);
    if (filesError) throw filesError;
    const folder = `${user.id}/${importId}`;
    const { data: objects, error: listError } = await client.storage
      .from("paper-imports")
      .list(folder, { limit: 10 });
    if (listError) throw listError;
    const uploadedNames = new Set((objects ?? []).map((object) => object.name));
    const complete = (files ?? []).every((file) =>
      uploadedNames.has(String(file.storage_path).split("/").at(-1) ?? ""),
    );
    if (!complete || !files || files.length === 0) {
      return Response.json({ error: "upload_incomplete" }, { status: 409 });
    }

    const { data: updated, error: updateError } = await client
      .from("import_jobs")
      .update({ status: "uploaded", updated_at: new Date().toISOString() })
      .eq("id", importId)
      .eq("owner_id", user.id)
      .eq("status", "uploading")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return Response.json({ error: "upload_conflict" }, { status: 409 });

    logServerEvent("info", "import.uploaded", {
      importId,
      ownerId: user.id,
    });
    return Response.json({ importId, status: "uploaded" }, { status: 202 });
  } catch {
    logServerEvent("error", "import.upload_finalize_failed", {
      importId,
      ownerId: user.id,
    });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
