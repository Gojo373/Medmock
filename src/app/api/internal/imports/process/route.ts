import { processNextImportJob } from "@/features/imports/server/import-processor";
import { createConfiguredProviderRuntimes } from "@/features/imports/server/provider-runtime-registry";
import {
  createImportWorkerHandler,
  type WorkerHandlerDependencies,
} from "@/features/imports/server/import-worker-handler";
import { SupabaseImportProcessingRepository } from "@/features/imports/server/supabase-import-processing-repository";

function productionDependencies(): WorkerHandlerDependencies {
  const secret = process.env.IMPORT_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("Import worker environment is incomplete.");
  }

  const repository = new SupabaseImportProcessingRepository();
  const runtimes = createConfiguredProviderRuntimes();

  return {
    secret,
    processNext: (workerId) => processNextImportJob(workerId, repository, runtimes),
    workerId: () => crypto.randomUUID(),
  };
}

export async function GET(request: Request) {
  try {
    return createImportWorkerHandler(productionDependencies())(request);
  } catch {
    return Response.json({ error: "worker_unconfigured" }, { status: 503 });
  }
}

export const POST = GET;
