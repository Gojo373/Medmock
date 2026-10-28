import { CreateImportRequestSchema } from "@/features/imports/contracts";
import { createImportJob } from "@/features/imports/server/import-job-store";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = CreateImportRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_import_request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const job = createImportJob(parsed.data.providerSelection);

  return Response.json(
    {
      importId: job.id,
      status: job.status,
    },
    { status: 202 },
  );
}
