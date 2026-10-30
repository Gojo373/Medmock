import { processNextImportJob } from "@/features/imports/server/import-processor";
import {
  createGeminiProviderRuntime,
  createOpenAIProviderRuntime,
} from "@/features/imports/server/provider-clients";
import {
  createImportWorkerHandler,
  type WorkerHandlerDependencies,
} from "@/features/imports/server/import-worker-handler";
import { SupabaseImportProcessingRepository } from "@/features/imports/server/supabase-import-processing-repository";

function productionDependencies(): WorkerHandlerDependencies {
  const secret = process.env.IMPORT_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const openAIKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (!secret || !openAIKey || !geminiKey) {
    throw new Error("Import worker environment is incomplete.");
  }

  const repository = new SupabaseImportProcessingRepository();
  const runtimes = {
    openai: createOpenAIProviderRuntime({
      apiKey: openAIKey,
      model: process.env.OPENAI_IMPORT_MODEL?.trim() || "gpt-5-mini",
    }),
    gemini: createGeminiProviderRuntime({
      apiKey: geminiKey,
      model: process.env.GEMINI_IMPORT_MODEL?.trim() || "gemini-2.5-flash",
    }),
  };

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
