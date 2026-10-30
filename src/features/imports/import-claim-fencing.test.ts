import { describe, expect, it, vi } from "vitest";

import { reconcileExtractions } from "@/features/imports/reconciliation";
import { ExtractionDocumentSchema } from "@/features/imports/schema";
import { SupabaseImportProcessingRepository } from "@/features/imports/server/supabase-import-processing-repository";

function reviewedDraft() {
  return reconcileExtractions([
    ExtractionDocumentSchema.parse({
      schemaVersion: 1,
      provider: "openai",
      source: {
        fileId: "paper-file",
        fileName: "paper.pdf",
        mimeType: "application/pdf",
      },
      paper: {
        title: { en: "NEET", hi: "नीट" },
        year: 2025,
        durationMinutes: 180,
        sections: [],
        questions: [],
      },
    }),
  ]);
}

function staleUpdateClient() {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return {
    client: { from: vi.fn().mockReturnValue(query) },
    query,
  };
}

describe("import worker claim fencing", () => {
  it("rejects stale completion and failure writes with the full claim fence", async () => {
    const completion = staleUpdateClient();
    const completionRepository = new SupabaseImportProcessingRepository(
      completion.client as never,
    );
    const claim = {
      id: "00000000-0000-4000-8000-000000000001",
      providerSelection: "openai" as const,
      processingAttempts: 2,
      claimToken: "worker-old",
    };

    await expect(
      completionRepository.completeExtraction(claim, [], reviewedDraft()),
    ).rejects.toThrow("Import claim is stale.");
    expect(completion.query.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ["id", claim.id],
        ["status", "extracting"],
        ["lease_owner", claim.claimToken],
        ["processing_attempts", claim.processingAttempts],
      ]),
    );

    const failure = staleUpdateClient();
    const failureRepository = new SupabaseImportProcessingRepository(
      failure.client as never,
    );
    await expect(
      failureRepository.fail(claim, "failed", "stale worker"),
    ).rejects.toThrow("Import claim is stale.");
  });
});
