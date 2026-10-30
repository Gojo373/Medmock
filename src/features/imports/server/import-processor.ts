import type { ExtractionProvider } from "@/features/imports/providers";
import { reconcileExtractions } from "@/features/imports/reconciliation";
import type {
  ExtractionDocument,
  ExtractionSource,
  ProviderSelection,
  ReconciledImport,
} from "@/features/imports/schema";

export type ImportFileKind = "paper" | "answer_key" | "solution";

export type StoredImportFile = {
  id: string;
  importId: string;
  storagePath: string;
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  kind: ImportFileKind;
};

export type ClaimedImportJob = {
  id: string;
  providerSelection: ProviderSelection;
  processingAttempts: number;
  claimToken: string;
};

export interface ImportProcessingRepository {
  claimNext(workerId: string, leaseSeconds: number): Promise<ClaimedImportJob | undefined>;
  listFiles(importId: string): Promise<StoredImportFile[]>;
  downloadFile(file: StoredImportFile): Promise<File>;
  completeExtraction(
    claim: ClaimedImportJob,
    documents: ExtractionDocument[],
    reconciled: ReconciledImport,
  ): Promise<void>;
  fail(claim: ClaimedImportJob, code: string, detail: string): Promise<void>;
}

export type ProviderRuntime = {
  provider: ExtractionProvider;
  uploadFile(file: File): Promise<string>;
};

export type ProviderRuntimes = Partial<
  Record<"openai" | "gemini" | "agentrouter", ProviderRuntime>
>;

function selectedRuntimeIds(selection: ProviderSelection) {
  if (selection === "openai") return ["openai"] as const;
  if (selection === "gemini") return ["gemini"] as const;
  if (selection === "agentrouter") return ["agentrouter"] as const;
  return ["openai", "gemini"] as const;
}

function requireFile(files: StoredImportFile[], kind: ImportFileKind) {
  const file = files.find((item) => item.kind === kind);
  if (!file && kind === "paper") {
    throw new Error("The import has no question paper file.");
  }
  return file;
}

function applyOfficialAnswerKeyEntries(
  document: ExtractionDocument,
  answerKey: StoredImportFile | undefined,
) {
  if (!answerKey) return document;

  const entryByQuestion = new Map(
    document.officialAnswerKeyEntries.map((entry) => [
      entry.sourceNumber,
      entry.acceptedOptionIds,
    ]),
  );

  return {
    ...document,
    paper: {
      ...document.paper,
      questions: document.paper.questions.map((question) => {
        const officialAnswer = entryByQuestion.get(question.sourceNumber);
        return officialAnswer
          ? {
              ...question,
              acceptedOptionIds: officialAnswer,
              answerKeyProvenance: {
                source: "official" as const,
                reference: answerKey.id,
              },
            }
          : question;
      }),
    },
  };
}

async function prepareSource(
  files: StoredImportFile[],
  downloaded: Map<string, File>,
  runtime: ProviderRuntime,
): Promise<ExtractionSource> {
  const paper = requireFile(files, "paper")!;
  const answerKey = requireFile(files, "answer_key");
  const solution = requireFile(files, "solution");

  async function upload(file: StoredImportFile) {
    const contents = downloaded.get(file.id);
    if (!contents) throw new Error("An import source file could not be downloaded.");
    return {
      fileId: await runtime.uploadFile(contents),
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }

  return {
    ...(await upload(paper)),
    ...(answerKey ? { answerKey: await upload(answerKey) } : {}),
    ...(solution ? { solution: await upload(solution) } : {}),
  };
}

export async function processClaimedImportJob(
  job: ClaimedImportJob,
  repository: ImportProcessingRepository,
  runtimes: ProviderRuntimes,
) {
  try {
    const files = await repository.listFiles(job.id);
    const downloaded = new Map<string, File>();

    for (const file of files) {
      downloaded.set(file.id, await repository.downloadFile(file));
    }

    const answerKey = requireFile(files, "answer_key");
    const documents: ExtractionDocument[] = [];

    for (const providerId of selectedRuntimeIds(job.providerSelection)) {
      const runtime = runtimes[providerId];
      if (!runtime) throw new Error(`${providerId} import provider is not configured.`);
      const source = await prepareSource(files, downloaded, runtime);
      const document = await runtime.provider.extract(source);
      documents.push(applyOfficialAnswerKeyEntries(document, answerKey));
    }

    const reconciled = reconcileExtractions(documents);
    await repository.completeExtraction(job, documents, reconciled);
    return reconciled;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown import processing failure";
    await repository.fail(job, "import_processing_failed", detail);
    throw error;
  }
}

export async function processNextImportJob(
  workerId: string,
  repository: ImportProcessingRepository,
  runtimes: ProviderRuntimes,
  leaseSeconds = 300,
) {
  const job = await repository.claimNext(workerId, leaseSeconds);
  if (!job) return { processed: false as const };

  await processClaimedImportJob(job, repository, runtimes);
  return { processed: true as const, importId: job.id };
}
