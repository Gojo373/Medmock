import { describe, expect, it, vi } from "vitest";

import {
  publishReviewedImport,
  reviewImport,
  type ImportReviewRepository,
} from "@/features/imports/server/import-review-service";
import { reconcileExtractions } from "@/features/imports/reconciliation";
import { ExtractionDocumentSchema } from "@/features/imports/schema";

function draft() {
  return reconcileExtractions([
    ExtractionDocumentSchema.parse({
      schemaVersion: 1,
      provider: "openai",
      source: {
        fileId: "file-1",
        fileName: "paper.pdf",
        mimeType: "application/pdf",
      },
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
    }),
  ]);
}

function repository(document = draft()) {
  const store = {
    status: "review_required" as const,
    reconciled: document,
    reviewed: undefined,
  };

  return {
    get: vi.fn().mockImplementation(async () => store),
    saveReview: vi.fn().mockImplementation(async (_id, reviewed, ready) => {
      store.reviewed = reviewed;
      Object.assign(store, { status: ready ? "ready_to_publish" : "review_required" });
    }),
    publish: vi.fn().mockResolvedValue(undefined),
  } satisfies ImportReviewRepository;
}

describe("import review and atomic publication", () => {
  it("persists explicit decisions and only marks fully resolved content ready", async () => {
    const store = repository();
    const adminFlag = draft().reviewFlags.find((flag) => flag.code === "admin_review")!;

    const reviewed = await reviewImport(store, "import-1", [
      { flagId: adminFlag.id, resolution: "confirm" },
    ]);

    expect(reviewed.canPublish).toBe(true);
    expect(store.saveReview).toHaveBeenCalledWith(
      "import-1",
      expect.objectContaining({
        reviewFlags: expect.arrayContaining([
          expect.objectContaining({ id: adminFlag.id, resolved: true }),
        ]),
      }),
      true,
    );
  });

  it("rejects publication until every flag is resolved and approval is explicit", async () => {
    const store = repository();

    await expect(
      publishReviewedImport(store, "import-1", "admin-1", {
        approved: true,
        paperId: "neet-2025",
        originalRevision: 1,
        currentRevision: 2,
      }),
    ).rejects.toThrow("Import is not ready to publish.");
    expect(store.publish).not.toHaveBeenCalled();
  });

  it("builds deterministic immutable versions and delegates one atomic publish", async () => {
    const reviewed = draft();
    reviewed.reviewFlags.forEach((flag) => {
      flag.resolved = true;
    });
    const store = repository(reviewed);
    store.get.mockResolvedValue({
      status: "ready_to_publish",
      reconciled: reviewed,
      reviewed,
    });

    const result = await publishReviewedImport(store, "import-1", "admin-1", {
      approved: true,
      paperId: "neet-2025",
      originalRevision: 1,
      currentRevision: 2,
    }, "2026-10-30T00:00:00.000Z");

    expect(result).toEqual({
      originalVersionId: "neet-2025-original-r1",
      currentVersionId: "neet-2025-current-r2",
    });
    expect(store.publish).toHaveBeenCalledWith(
      "import-1",
      "admin-1",
      expect.objectContaining({
        original: expect.objectContaining({
          id: "neet-2025-original-r1",
          pattern: "original",
        }),
        current: expect.objectContaining({
          id: "neet-2025-current-r2",
          pattern: "current",
        }),
      }),
    );
  });

  it("publishes reviewed English-only content without inventing Hindi", async () => {
    const reviewed = draft();
    delete reviewed.paper.title?.hi;
    delete reviewed.paper.sections[0].title?.hi;
    delete reviewed.paper.questions[0].stem?.hi;
    delete reviewed.paper.questions[0].solution?.hi;
    for (const option of reviewed.paper.questions[0].options) {
      delete option.text?.hi;
    }
    reviewed.reviewFlags.forEach((flag) => {
      flag.resolved = true;
    });
    const store = repository(reviewed);
    store.get.mockResolvedValue({
      status: "ready_to_publish",
      reconciled: reviewed,
      reviewed,
    });

    await publishReviewedImport(store, "import-1", "admin-1", {
      approved: true,
      paperId: "neet-english",
      originalRevision: 1,
      currentRevision: 2,
    }, "2026-11-01T00:00:00.000Z");

    expect(store.publish).toHaveBeenCalledWith(
      "import-1",
      "admin-1",
      expect.objectContaining({
        original: expect.objectContaining({
          title: { en: "NEET 2025" },
          questions: expect.arrayContaining([
            expect.objectContaining({ stem: { en: "Question" } }),
          ]),
        }),
      }),
    );
  });

  it("persists normalized legacy Hindi flags before atomic publication", async () => {
    const reviewed = draft();
    reviewed.reviewFlags.forEach((flag) => {
      flag.resolved = true;
    });
    reviewed.reviewFlags.push({
      id: "missing_field:questions.1.options.A.text.hi",
      code: "missing_field",
      path: "questions.1.options.A.text.hi",
      message: "Required reviewed content is missing or invalid.",
      severity: "error",
      resolved: false,
    });
    const store = repository(reviewed);
    store.get.mockResolvedValue({
      status: "review_required",
      reconciled: reviewed,
      reviewed,
    });

    await publishReviewedImport(store, "import-1", "admin-1", {
      approved: true,
      paperId: "neet-legacy",
      originalRevision: 1,
      currentRevision: 2,
    });

    expect(store.saveReview).toHaveBeenCalledWith(
      "import-1",
      expect.objectContaining({
        reviewFlags: expect.not.arrayContaining([
          expect.objectContaining({ path: "questions.1.options.A.text.hi" }),
        ]),
      }),
      true,
    );
    expect(store.publish).toHaveBeenCalledOnce();
  });

  it("returns existing matching publication IDs on a published retry", async () => {
    const reviewed = draft();
    reviewed.reviewFlags.forEach((flag) => {
      flag.resolved = true;
    });
    const store = repository(reviewed);
    store.get.mockResolvedValue({
      status: "published",
      reconciled: reviewed,
      reviewed,
      publishedOriginalVersionId: "neet-2025-original-r1",
      publishedCurrentVersionId: "neet-2025-current-r2",
    });

    await expect(
      publishReviewedImport(store, "import-1", "admin-1", {
        approved: true,
        paperId: "neet-2025",
        originalRevision: 1,
        currentRevision: 2,
      }),
    ).resolves.toEqual({
      originalVersionId: "neet-2025-original-r1",
      currentVersionId: "neet-2025-current-r2",
    });
    expect(store.publish).not.toHaveBeenCalled();

    await expect(
      publishReviewedImport(store, "import-1", "admin-1", {
        approved: true,
        paperId: "neet-2025",
        originalRevision: 3,
        currentRevision: 4,
      }),
    ).rejects.toThrow("Import was already published with different versions.");
  });
});
