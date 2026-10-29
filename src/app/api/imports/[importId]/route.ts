import { z } from "zod";

import { ImportStatusResponseSchema } from "@/features/imports/contracts";
import { getImportJob } from "@/features/imports/server/import-job-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";

export async function GET(
  request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  const user = await getRequestUser(request);

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { importId } = await context.params;
  const parsedId = z.string().uuid().safeParse(importId);

  if (!parsedId.success) {
    return Response.json({ error: "invalid_import_id" }, { status: 400 });
  }

  let job;

  try {
    job = await getImportJob(parsedId.data);
  } catch {
    logServerEvent("error", "import.read_failed", { importId: parsedId.data });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }

  if (!job) {
    return Response.json({ error: "import_not_found" }, { status: 404 });
  }

  return Response.json(
    ImportStatusResponseSchema.parse({
      importId: job.id,
      status: job.status,
      reviewFlagCount: job.reviewFlagCount,
    }),
  );
}
