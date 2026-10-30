import { describe, expect, it, vi } from "vitest";

import type { ExtractionProvider } from "@/features/imports/providers";
import {
  processClaimedImportJob,
  processNextImportJob,
  type ClaimedImportJob,
  type ImportProcessingRepository,
  type ProviderRuntime,
  type StoredImportFile,
} from "@/features/imports/server/import-processor";
import { ExtractionDocumentSchema } from "@/features/imports/schema";

const files: StoredImportFile[] = [
  {
    id: "paper-file",
    importId: "import-1",
    storagePath: "admin/import-1/paper.pdf",
    fileName: "paper.pdf",
    mimeType: "application/pdf",
    kind: "paper",
  },
  {
    id: "key-file",
    importId: "import-1",
    storagePath: "admin/import-1/key.pdf",
    fileName: "key.pdf",
    mimeType: "application/pdf",
    kind: "answer_key",
  },
  {
    id: "solution-file",
    importId: "import-1",
    storagePath: "admin/import-1/solutions.pdf",
    fileName: "solutions.pdf",
    mimeType: "application/pdf",
    kind: "solution",
  },
];

function extracted(provider: "openai" | "gemini" | "agentrouter", source: unknown) {
  return ExtractionDocumentSchema.parse({
    schemaVersion: 1,
    provider,
    source,
    paper: {
      title: { en: "NEET 2025", hi: "नीट 2025" },
      year: 2025,
      durationMinutes: 180,
      sections: [
        {
          id: "physics-a",
          subject: "physics",
          title: { en: "Physics", hi: "भौतिक विज्ञान" },
          questionNumbers: ["1"],
        },
      ],
      questions: [
        {
          sourceNumber: "1",
          sectionId: "physics-a",
          subject: "physics",
          topic: "Mechanics",
          stem: { en: "Question", hi: "प्रश्न" },
          options: [
            { id: "A", text: { en: "A", hi: "ए" } },
            { id: "B", text: { en: "B", hi: "बी" } },
          ],
          acceptedOptionIds: ["A"],
          solution: { en: "Solution", hi: "समाधान" },
          confidence: {
            stem: 1,
            options: 1,
            answerKey: 1,
            translation: 1,
            solution: 1,
          },
        },
      ],
    },
  });
}

function repository(overrides: Partial<ImportProcessingRepository> = {}) {
  return {
    claimNext: vi.fn(),
    listFiles: vi.fn().mockResolvedValue(files),
    downloadFile: vi.fn().mockImplementation(async (file: StoredImportFile) =>
      new File([file.kind], file.fileName, { type: file.mimeType }),
    ),
    completeExtraction: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies ImportProcessingRepository;
}

function runtime(id: "openai" | "gemini" | "agentrouter") {
  const provider: ExtractionProvider = {
    id,
    extract: vi.fn().mockImplementation(async (source) => extracted(id, source)),
  };

  return {
    provider,
    uploadFile: vi.fn().mockImplementation(async (file: File) => `${id}:${file.name}`),
  } satisfies ProviderRuntime;
}

describe("durable import processing", () => {
  it("processes an AgentRouter-selected job without invoking other providers", async () => {
    const job: ClaimedImportJob = {
      id: "import-1",
      providerSelection: "agentrouter",
      processingAttempts: 1,
      claimToken: "worker-1",
    };
    const store = repository();
    const openai = runtime("openai");
    const gemini = runtime("gemini");
    const agentrouter = runtime("agentrouter");

    await processClaimedImportJob(job, store, {
      openai,
      gemini,
      agentrouter,
    });

    expect(agentrouter.provider.extract).toHaveBeenCalledOnce();
    expect(openai.provider.extract).not.toHaveBeenCalled();
    expect(gemini.provider.extract).not.toHaveBeenCalled();
  });

  it("applies official provenance only to answers extracted from the answer-key attachment", async () => {
    const job: ClaimedImportJob = {
      id: "import-1",
      providerSelection: "openai",
      processingAttempts: 1,
      claimToken: "worker-1",
    };
    const store = repository();
    const openai = runtime("openai");
    vi.mocked(openai.provider.extract).mockImplementationOnce(async (source) => ({
      ...extracted("openai", source),
      officialAnswerKeyEntries: [
        { sourceNumber: "1", acceptedOptionIds: ["B"] },
      ],
    }));

    await processClaimedImportJob(job, store, {
      openai,
      gemini: runtime("gemini"),
    });

    const reconciled = vi.mocked(store.completeExtraction).mock.calls[0][2];
    expect(reconciled.paper.questions[0]).toMatchObject({
      acceptedOptionIds: ["B"],
      answerKeyProvenance: { source: "official", reference: "key-file" },
    });

    const noEntriesStore = repository();
    await processClaimedImportJob(job, noEntriesStore, {
      openai: runtime("openai"),
      gemini: runtime("gemini"),
    });
    const withoutOfficialEntry = vi.mocked(
      noEntriesStore.completeExtraction,
    ).mock.calls[0][2];
    expect(withoutOfficialEntry.paper.questions[0].answerKeyProvenance).toEqual({
      source: "provider",
    });
  });

  it("uploads paper, official key, and solutions to every selected provider", async () => {
    const job: ClaimedImportJob = {
      id: "import-1",
      providerSelection: "both",
      processingAttempts: 1,
      claimToken: "worker-1",
    };
    const store = repository();
    const openai = runtime("openai");
    const gemini = runtime("gemini");

    await processClaimedImportJob(job, store, { openai, gemini });

    expect(openai.uploadFile).toHaveBeenCalledTimes(3);
    expect(gemini.uploadFile).toHaveBeenCalledTimes(3);
    expect(openai.provider.extract).toHaveBeenCalledWith({
      fileId: "openai:paper.pdf",
      fileName: "paper.pdf",
      mimeType: "application/pdf",
      answerKey: {
        fileId: "openai:key.pdf",
        fileName: "key.pdf",
        mimeType: "application/pdf",
      },
      solution: {
        fileId: "openai:solutions.pdf",
        fileName: "solutions.pdf",
        mimeType: "application/pdf",
      },
    });
    expect(store.completeExtraction).toHaveBeenCalledWith(
      job,
      expect.arrayContaining([
        expect.objectContaining({ provider: "openai" }),
        expect.objectContaining({ provider: "gemini" }),
      ]),
      expect.objectContaining({ status: "review_required" }),
    );
  });

  it("persists processing failures so a later lease can retry safely", async () => {
    const job: ClaimedImportJob = {
      id: "import-1",
      providerSelection: "openai",
      processingAttempts: 2,
      claimToken: "worker-1",
    };
    const store = repository({
      downloadFile: vi.fn().mockRejectedValue(new Error("storage unavailable")),
    });

    await expect(
      processClaimedImportJob(job, store, {
        openai: runtime("openai"),
        gemini: runtime("gemini"),
      }),
    ).rejects.toThrow("storage unavailable");

    expect(store.fail).toHaveBeenCalledWith(
      job,
      "import_processing_failed",
      "storage unavailable",
    );
    expect(store.completeExtraction).not.toHaveBeenCalled();
  });

  it("claims at most one leased job per worker invocation", async () => {
    const job: ClaimedImportJob = {
      id: "import-1",
      providerSelection: "gemini",
      processingAttempts: 1,
      claimToken: "worker-1",
    };
    const store = repository({ claimNext: vi.fn().mockResolvedValue(job) });

    await expect(
      processNextImportJob("worker-1", store, {
        openai: runtime("openai"),
        gemini: runtime("gemini"),
      }),
    ).resolves.toEqual({ importId: "import-1", processed: true });

    expect(store.claimNext).toHaveBeenCalledWith("worker-1", 300);
    expect(store.claimNext).toHaveBeenCalledTimes(1);
  });
});
