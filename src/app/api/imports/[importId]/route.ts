import { z } from "zod";

import { ImportStatusResponseSchema } from "@/features/imports/contracts";
import { getImportJob } from "@/features/imports/server/import-job-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  const { importId } = await context.params;
  const parsedId = z.string().uuid().safeParse(importId);

  if (!parsedId.success) {
    return Response.json({ error: "invalid_import_id" }, { status: 400 });
  }

  const job = getImportJob(parsedId.data);

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
