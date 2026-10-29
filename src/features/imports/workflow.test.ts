import { describe, expect, it } from "vitest";

import {
  ExtractionDocumentSchema,
  type ExtractionDocument,
  type ExtractionPayload,
} from "@/features/imports/schema";
import {
  createGeminiExtractionProvider,
  createOpenAIExtractionProvider,
  selectExtractionProviders,
} from "@/features/imports/providers";
import {
  buildPaperVersionFromImport,
  reconcileExtractions,
  validateImportForPublish,
} from "@/features/imports/reconciliation";
import { transitionImport } from "@/features/imports/state-machine";

function localized(en: string, hi = en + " हिंदी") {
  return { en, hi };
}

function payload(overrides: Record<string, unknown> = {}): ExtractionPayload {
  return {
    schemaVersion: 1,
    paper: {
      title: localized("NEET 2025"),
      year: 2025,
      durationMinutes: 180,
      questions: [
        {
          sourceNumber: "1",
          sectionId: "physics",
          subject: "physics",
          topic: "Mechanics",
          stem: localized("What is force?"),
          options: [
            { id: "A", text: localized("Mass times acceleration") },
            { id: "B", text: localized("Mass divided by acceleration") },
          ],
          acceptedOptionIds: ["A"],
          solution: localized("Use Newton's second law."),
          confidence: {
            stem: 0.96,
            options: 0.94,
            answerKey: 0.92,
            translation: 0.9,
            solution: 0.88,
          },
        },
      ],
    },
    ...overrides,
  };
}

function document(
  provider: "openai" | "gemini",
  payloadValue: ExtractionPayload = payload(),
): ExtractionDocument {
  return ExtractionDocumentSchema.parse({
    ...payloadValue,
    provider,
    source: {
      fileId: provider === "openai" ? "file-openai" : "file-gemini",
      fileName: "neet-2025.pdf",
      mimeType: "application/pdf",
    },
  });
}

describe("provider selection and adapters", () => {
  it("selects OpenAI, Gemini, or both in a stable order", () => {
    const registry = {
      openai: { id: "openai", extract: async () => document("openai") },
      gemini: { id: "gemini", extract: async () => document("gemini") },
    } as const;

    expect(selectExtractionProviders("openai", registry).map((item) => item.id)).toEqual([
      "openai",
    ]);
    expect(selectExtractionProviders("gemini", registry).map((item) => item.id)).toEqual([
      "gemini",
    ]);
    expect(selectExtractionProviders("both", registry).map((item) => item.id)).toEqual([
      "openai",
      "gemini",
    ]);
  });

  it("uses an OpenAI Responses file input with schema-constrained parsed output", async () => {
    const requests: unknown[] = [];
    const client = {
      responses: {
        parse: async (request: unknown) => {
          requests.push(request);
          return { output_parsed: payload() };
        },
      },
    };
    const provider = createOpenAIExtractionProvider({
      client,
      model: "openai-extraction-model",
      format: { type: "json-schema-format" },
    });

    const extracted = await provider.extract({
      fileId: "file-openai",
      fileName: "neet-2025.pdf",
      mimeType: "application/pdf",
    });

    expect(extracted.provider).toBe("openai");
    expect(extracted.paper.questions).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: "openai-extraction-model",
      input: [
        { role: "system" },
        {
          role: "user",
          content: [
            { type: "input_file", file_id: "file-openai" },
            { type: "input_text" },
          ],
        },
      ],
      text: { format: { type: "json-schema-format" } },
    });
  });

  it("uses Gemini document input with JSON response schema", async () => {
    const requests: unknown[] = [];
    const client = {
      models: {
        generateContent: async (request: unknown) => {
          requests.push(request);
          return { text: JSON.stringify(payload()) };
        },
      },
    };
    const provider = createGeminiExtractionProvider({
      client,
      model: "gemini-extraction-model",
    });

    const extracted = await provider.extract({
      fileId: "https://generativelanguage.googleapis.com/files/file-gemini",
      fileName: "neet-2025.pdf",
      mimeType: "application/pdf",
    });

    expect(extracted.provider).toBe("gemini");
    expect(extracted.paper.questions[0].acceptedOptionIds).toEqual(["A"]);
    expect(requests[0]).toMatchObject({
      model: "gemini-extraction-model",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: "https://generativelanguage.googleapis.com/files/file-gemini",
                mimeType: "application/pdf",
              },
            },
            { text: expect.any(String) },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: expect.any(Object),
      },
    });
  });
});

describe("reconcileExtractions", () => {
  it("keeps provider nulls as reviewable missing metadata", () => {
    const parsed = ExtractionDocumentSchema.parse({
      ...payload(),
      provider: "openai",
      source: {
        fileId: "file-openai",
        fileName: "neet-2025.pdf",
        mimeType: "application/pdf",
      },
      paper: {
        ...payload().paper,
        year: null,
        durationMinutes: null,
      },
    });

    const draft = reconcileExtractions([parsed]);

    expect(draft.reviewFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_field", path: "paper.year" }),
        expect.objectContaining({
          code: "missing_field",
          path: "paper.durationMinutes",
        }),
      ]),
    );
  });

  it("preserves provider-only questions and flags the missing counterpart", () => {
    const geminiPayload = payload();
    geminiPayload.paper.questions.push({
      ...structuredClone(geminiPayload.paper.questions[0]),
      sourceNumber: "2",
      stem: localized("What is momentum?"),
    });

    const draft = reconcileExtractions([
      document("openai"),
      document("gemini", geminiPayload),
    ]);

    expect(draft.paper.questions.map((question) => question.sourceNumber)).toEqual([
      "1",
      "2",
    ]);
    expect(draft.reviewFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_field",
          path: "questions.2",
        }),
      ]),
    );
  });

  it("turns provider disagreements into review flags instead of silently choosing", () => {
    const openai = document("openai");
    const geminiPayload = payload();
    geminiPayload.paper.questions[0].stem!.en = "What is energy?";
    geminiPayload.paper.questions[0].acceptedOptionIds = ["B"];

    const draft = reconcileExtractions([openai, document("gemini", geminiPayload)]);

    expect(draft.reviewFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "provider_conflict",
          path: "questions.1.stem.en",
          resolved: false,
        }),
        expect.objectContaining({
          code: "provider_conflict",
          path: "questions.1.acceptedOptionIds",
          resolved: false,
        }),
      ]),
    );
    expect(draft.status).toBe("review_required");
  });

  it("flags low confidence and a missing answer key for review", () => {
    const incompletePayload = payload();
    incompletePayload.paper.questions[0].acceptedOptionIds = [];
    incompletePayload.paper.questions[0].confidence.answerKey = 0.42;

    const draft = reconcileExtractions([document("openai", incompletePayload)]);

    expect(draft.reviewFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_field",
          path: "questions.1.acceptedOptionIds",
        }),
        expect.objectContaining({
          code: "low_confidence",
          path: "questions.1.confidence.answerKey",
        }),
      ]),
    );
  });

  it("lets an uploaded official key override model suggestions", () => {
    const openai = document("openai");
    const geminiPayload = payload();
    geminiPayload.paper.questions[0].acceptedOptionIds = ["B"];

    const draft = reconcileExtractions([openai, document("gemini", geminiPayload)], {
      officialAnswerKey: { "1": ["B"] },
    });

    expect(draft.paper.questions[0].acceptedOptionIds).toEqual(["B"]);
    expect(
      draft.reviewFlags.some(
        (flag) =>
          flag.code === "provider_conflict" &&
          flag.path === "questions.1.acceptedOptionIds",
      ),
    ).toBe(false);
  });
});

describe("review and publish policy", () => {
  it("blocks publishing while required content or review flags remain unresolved", () => {
    const incompletePayload = payload();
    incompletePayload.paper.questions[0].solution = {
      en: "Use Newton's second law.",
    };
    const draft = reconcileExtractions([document("openai", incompletePayload)]);

    const validation = validateImportForPublish(draft);

    expect(validation.canPublish).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_required_content" }),
        expect.objectContaining({ code: "unresolved_review_flags" }),
      ]),
    );
  });

  it("allows publishing only after content is complete and every flag is resolved", () => {
    const openai = document("openai");
    const geminiPayload = payload();
    geminiPayload.paper.questions[0].stem!.en = "Define force.";
    const draft = reconcileExtractions([openai, document("gemini", geminiPayload)]);
    const reviewedDraft = {
      ...draft,
      reviewFlags: draft.reviewFlags.map((flag) => ({ ...flag, resolved: true })),
    };

    expect(validateImportForPublish(reviewedDraft)).toEqual({
      canPublish: true,
      issues: [],
    });
  });

  it("maps an approved extraction into the shared published paper schema", () => {
    const draft = reconcileExtractions([document("openai")]);
    const reviewedDraft = {
      ...draft,
      reviewFlags: draft.reviewFlags.map((flag) => ({ ...flag, resolved: true })),
    };

    const version = buildPaperVersionFromImport(reviewedDraft, {
      id: "version-2025-1",
      paperId: "neet-2025",
      revision: 1,
      publishedAt: "2026-10-28T10:00:00.000Z",
    });

    expect(version).toMatchObject({
      id: "version-2025-1",
      paperId: "neet-2025",
      status: "published",
      durationMinutes: 180,
      sections: [
        {
          id: "physics",
          questionIds: ["version-2025-1:q:1"],
        },
      ],
      questions: [
        {
          id: "version-2025-1:q:1",
          acceptedOptionIds: ["A"],
          solution: localized("Use Newton's second law."),
        },
      ],
    });
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.questions)).toBe(true);
    expect(Object.isFrozen(version.questions[0])).toBe(true);
    expect(() => {
      version.questions[0].topic = "Mutated after publication";
    }).toThrow();
  });

  it("requires an explicit review completion event before publication", () => {
    const uploaded = {
      id: "import-1",
      status: "uploaded" as const,
      providerSelection: "both" as const,
      reviewFlagCount: 0,
    };
    const extracting = transitionImport(uploaded, { type: "START_EXTRACTION" });
    const awaitingReview = transitionImport(extracting, {
      type: "EXTRACTION_COMPLETED",
      reviewFlagCount: 0,
    });

    expect(awaitingReview.status).toBe("review_required");
    expect(() => transitionImport(awaitingReview, { type: "PUBLISH" })).toThrow(
      "Review must be completed before publishing.",
    );

    const ready = transitionImport(awaitingReview, { type: "COMPLETE_REVIEW" });
    expect(transitionImport(ready, { type: "PUBLISH" }).status).toBe("published");
  });
});
