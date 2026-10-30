import { describe, expect, it, vi } from "vitest";

import {
  createImportPublishHandler,
  createImportReviewHandlers,
} from "@/features/imports/server/import-review-handlers";
import type { ImportReviewRepository } from "@/features/imports/server/import-review-service";
import { reconcileExtractions } from "@/features/imports/reconciliation";
import { ExtractionDocumentSchema } from "@/features/imports/schema";

const importId = "00000000-0000-4000-8000-000000000001";
const adminHeaders = {
  "content-type": "application/json",
  "x-medmock-user-id": "admin-1",
  "x-medmock-role": "admin",
};

function reviewedDraft() {
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
        title: { en: "NEET", hi: "नीट" },
        year: 2025,
        durationMinutes: 180,
        sections: [
          {
            id: "physics",
            subject: "physics",
            title: { en: "Physics", hi: "भौतिक विज्ञान" },
            questionNumbers: ["1"],
          },
        ],
        questions: [
          {
            sourceNumber: "1",
            sectionId: "physics",
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

function repository(): ImportReviewRepository {
  const reconciled = reviewedDraft();
  const record: Awaited<ReturnType<ImportReviewRepository["get"]>> = {
    status: "review_required",
    reconciled,
  };
  return {
    get: vi.fn().mockImplementation(async () => record),
    saveReview: vi.fn().mockImplementation(async (_id, reviewed, ready) => {
      record.reviewed = reviewed;
      record.status = ready ? "ready_to_publish" : "review_required";
    }),
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

describe("import review routes", () => {
  it("returns the reconciled document only to an authenticated admin", async () => {
    const handlers = createImportReviewHandlers(repository());
    const context = { params: Promise.resolve({ importId }) };
    const unauthorized = await handlers.GET(
      new Request(`http://localhost/api/imports/${importId}/review`),
      context,
    );
    const authorized = await handlers.GET(
      new Request(`http://localhost/api/imports/${importId}/review`, {
        headers: adminHeaders,
      }),
      context,
    );

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
    expect((await authorized.json()).document.reviewFlags).toHaveLength(1);
  });

  it("applies validated decisions before exposing publication readiness", async () => {
    const store = repository();
    const flagId = (await store.get(importId))!.reconciled.reviewFlags[0].id;
    const handlers = createImportReviewHandlers(store);
    const response = await handlers.PATCH(
      new Request(`http://localhost/api/imports/${importId}/review`, {
        method: "PATCH",
        headers: adminHeaders,
        body: JSON.stringify({
          decisions: [{ flagId, resolution: "confirm" }],
        }),
      }),
      { params: Promise.resolve({ importId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ canPublish: true });
  });

  it("requires explicit approval and delegates atomic publication", async () => {
    const store = repository();
    const record = await store.get(importId);
    record!.reconciled.reviewFlags.forEach((flag) => {
      flag.resolved = true;
    });
    record!.reviewed = record!.reconciled;
    record!.status = "ready_to_publish";
    const handler = createImportPublishHandler(store);
    const response = await handler(
      new Request(`http://localhost/api/imports/${importId}/publish`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          approved: true,
          paperId: "neet-2025",
          originalRevision: 1,
          currentRevision: 2,
        }),
      }),
      { params: Promise.resolve({ importId }) },
    );

    expect(response.status).toBe(200);
    expect(store.publish).toHaveBeenCalledTimes(1);
  });
});
