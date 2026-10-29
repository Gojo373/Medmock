import { CreateImportRequestSchema } from "@/features/imports/contracts";
import { createImportJob } from "@/features/imports/server/import-job-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";

export async function POST(request: Request) {
  const user = await getRequestUser(request);

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

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

  try {
    const job = await createImportJob(parsed.data.providerSelection, user.id);

    logServerEvent("info", "import.created", {
      importId: job.id,
      ownerId: user.id,
    });

    return Response.json(
      {
        importId: job.id,
        status: job.status,
      },
      { status: 202 },
    );
  } catch {
    logServerEvent("error", "import.create_failed", { ownerId: user.id });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
