import { describe, expect, it } from "vitest";

import type { PaperVersion } from "@/features/exam/domain";
import {
  ExtractionDocumentSchema,
  extractionResponseJsonSchema,
  type ExtractionDocument,
  type ExtractionPayload,
} from "@/features/imports/schema";
import {
  createGeminiExtractionProvider,
  createAgentRouterExtractionProvider,
  createOpenAIExtractionProvider,
  selectExtractionProviders,
} from "@/features/imports/providers";
import {
  buildPaperVersionFromImport,
  reconcileExtractions,
  validateImportForPublish,
} from "@/features/imports/reconciliation";
import * as reconciliationModule from "@/features/imports/reconciliation";
import { transitionImport } from "@/features/imports/state-machine";

function localized(en: string, hi = en + " हिंदी") {
  return { en, hi };
}

function payload(overrides: Record<string, unknown> = {}): ExtractionPayload {
  return {
    schemaVersion: 1,
    officialAnswerKeyEntries: [],
    paper: {
      title: localized("NEET 2025"),
      year: 2025,
      durationMinutes: 180,
      sections: [],
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
          disposition: "standard",
          marking: { correct: 4, incorrect: -1, unattempted: 0 },
          answerKeyProvenance: { source: "provider" },
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
  it("defines a complete recursively strict provider response schema", () => {
    const objectPaths: string[] = [];
    const missingStrictness: string[] = [];

    function inspect(value: unknown, path: string) {
      if (!value || typeof value !== "object") return;
      const schema = value as Record<string, unknown>;
      if (schema.type === "object" ||
        (Array.isArray(schema.type) && schema.type.includes("object"))) {
        objectPaths.push(path);
        if (schema.additionalProperties !== false) missingStrictness.push(path);
        const properties = schema.properties as Record<string, unknown> | undefined;
        if (properties) {
          for (const [key, child] of Object.entries(properties)) {
            inspect(child, `${path}.${key}`);
          }
        }
      }
      if (schema.items) inspect(schema.items, `${path}[]`);
    }

    inspect(extractionResponseJsonSchema, "$response");
    expect(objectPaths.length).toBeGreaterThan(8);
    expect(missingStrictness).toEqual([]);

    const questionSchema = (
      extractionResponseJsonSchema.properties.paper.properties.questions.items
    );
    expect(Object.keys(questionSchema.properties).sort()).toEqual(
      [...questionSchema.required].sort(),
    );
    expect(questionSchema.properties).toHaveProperty("answerKeyProvenance");
  });

  it("selects OpenAI, Gemini, or both in a stable order", () => {
    const registry = {
      openai: { id: "openai", extract: async () => document("openai") },
      gemini: { id: "gemini", extract: async () => document("gemini") },
      agentrouter: {
        id: "agentrouter",
        extract: async () => document("openai"),
      },
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
    expect(
      selectExtractionProviders("agentrouter", registry).map((item) => item.id),
    ).toEqual(["agentrouter"]);
  });

  it("uses AgentRouter Responses with inline multimodal content", async () => {
    const requests: unknown[] = [];
    const provider = createAgentRouterExtractionProvider({
      client: {
        responses: {
          parse: async (request: unknown) => {
            requests.push(request);
            return { output_parsed: payload() };
          },
        },
      },
      format: { type: "json_schema" },
      model: "agentrouter-vision-model",
    });

    const extracted = await provider.extract({
      fileId: "data:image/png;base64,aW1hZ2U=",
      fileName: "paper.png",
      mimeType: "image/png",
    });

    expect(extracted.provider).toBe("agentrouter");
    expect(requests[0]).toMatchObject({
      model: "agentrouter-vision-model",
      input: [
        { role: "system" },
        {
          role: "user",
          content: [
            { type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" },
            { type: "input_text" },
          ],
        },
      ],
    });
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

  it("normalizes provider nulls into reviewable missing question fields", async () => {
    const nullablePayload = structuredClone(payload()) as unknown as {
      schemaVersion: 1;
      paper: {
        questions: Array<Record<string, unknown>>;
      };
    };
    Object.assign(nullablePayload.paper.questions[0], {
      sectionId: null,
      subject: null,
      topic: null,
      stem: null,
      solution: null,
    });
    const provider = createOpenAIExtractionProvider({
      client: {
        responses: {
          parse: async () => ({ output_parsed: nullablePayload }),
        },
      },
      model: "openai-extraction-model",
      format: { type: "json-schema-format" },
    });

    const extracted = await provider.extract({
      fileId: "file-openai",
      fileName: "neet-2025.pdf",
      mimeType: "application/pdf",
    });
    const question = extracted.paper.questions[0];
    expect(question).toMatchObject({ sourceNumber: "1" });
    expect(question.sectionId).toBeUndefined();
    expect(question.subject).toBeUndefined();
    expect(question.topic).toBeUndefined();
    expect(question.stem).toBeUndefined();
    expect(question.solution).toBeUndefined();

    const draft = reconcileExtractions([extracted]);
    expect(draft.reviewFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "questions.1.sectionId" }),
        expect.objectContaining({ path: "questions.1.subject" }),
        expect.objectContaining({ path: "questions.1.topic" }),
        expect.objectContaining({ path: "questions.1.stem.en" }),
        expect.objectContaining({ path: "questions.1.solution.en" }),
      ]),
    );
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

  it("flags paper structure, scoring, and bilingual metadata disagreements", () => {
    const openaiPayload = payload();
    openaiPayload.paper.sections = [
      {
        id: "physics",
        subject: "physics",
        title: localized("Physics"),
        questionNumbers: ["1"],
        selectionLimit: 1,
      },
    ];
    const geminiPayload = structuredClone(openaiPayload);
    geminiPayload.paper.durationMinutes = 200;
    geminiPayload.paper.sections[0].title.hi = "भौतिकी";
    geminiPayload.paper.sections[0].selectionLimit = null;
    geminiPayload.paper.questions[0].sectionId = "physics-b";
    geminiPayload.paper.questions[0].subject = "chemistry";
    geminiPayload.paper.questions[0].topic = "Physical chemistry";
    geminiPayload.paper.questions[0].disposition = "bonus";
    geminiPayload.paper.questions[0].marking = {
      correct: 5,
      incorrect: -2,
      unattempted: 0,
    };

    const draft = reconcileExtractions([
      document("openai", openaiPayload),
      document("gemini", geminiPayload),
    ]);

    expect(draft.reviewFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "paper.durationMinutes" }),
        expect.objectContaining({ path: "paper.sections.physics.title.hi" }),
        expect.objectContaining({ path: "paper.sections.physics.selectionLimit" }),
        expect.objectContaining({ path: "questions.1.sectionId" }),
        expect.objectContaining({ path: "questions.1.subject" }),
        expect.objectContaining({ path: "questions.1.topic" }),
        expect.objectContaining({ path: "questions.1.disposition" }),
        expect.objectContaining({ path: "questions.1.marking" }),
      ]),
    );
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

  it("applies an explicit provider choice to the reviewed field before resolving its flag", () => {
    const openai = document("openai");
    const geminiPayload = payload();
    geminiPayload.paper.questions[0].stem!.en = "Define force.";
    const draft = reconcileExtractions([openai, document("gemini", geminiPayload)]);
    const conflict = draft.reviewFlags.find(
      (flag) => flag.path === "questions.1.stem.en",
    )!;

    const applyReviewDecisions = (
      reconciliationModule as typeof reconciliationModule & {
        applyReviewDecisions: (
          draft: ReturnType<typeof reconcileExtractions>,
          decisions: Array<{ flagId: string; resolution: string }>,
        ) => ReturnType<typeof reconcileExtractions>;
      }
    ).applyReviewDecisions;
    const reviewed = applyReviewDecisions(draft, [
      { flagId: conflict.id, resolution: "accept_secondary" },
    ]);

    expect(reviewed.paper.questions[0].stem?.en).toBe("Define force.");
    expect(reviewed.reviewFlags.find((flag) => flag.id === conflict.id)?.resolved).toBe(true);
  });

  it("edits option arrays through schema-aware paths without corrupting them", () => {
    const incompletePayload = payload();
    incompletePayload.paper.questions[0].options[0].text = {
      en: "Mass times acceleration",
    };
    const draft = reconcileExtractions([document("openai", incompletePayload)]);
    const flag = draft.reviewFlags.find(
      (item) => item.path === "questions.1.options.A.text.hi",
    )!;

    const reviewed = reconciliationModule.applyReviewDecisions(draft, [
      {
        flagId: flag.id,
        resolution: "manual_value",
        manualValue: "द्रव्यमान गुणा त्वरण",
      },
    ]);

    expect(reviewed.paper.questions[0].options).toEqual([
      {
        id: "A",
        text: {
          en: "Mass times acceleration",
          hi: "द्रव्यमान गुणा त्वरण",
        },
      },
      incompletePayload.paper.questions[0].options[1],
    ]);
  });

  it("requires a valid replacement for missing values and permits correction before publication", () => {
    const incompletePayload = payload();
    incompletePayload.paper.questions[0].acceptedOptionIds = [];
    const missingDraft = reconcileExtractions([document("openai", incompletePayload)]);
    const missingFlag = missingDraft.reviewFlags.find(
      (item) => item.path === "questions.1.acceptedOptionIds",
    )!;

    expect(() =>
      reconciliationModule.applyReviewDecisions(missingDraft, [
        { flagId: missingFlag.id, resolution: "confirm" },
      ]),
    ).toThrow("Missing required values need a valid replacement.");

    const openai = document("openai");
    const geminiPayload = payload();
    geminiPayload.paper.questions[0].stem!.en = "Define force.";
    const conflictDraft = reconcileExtractions([
      openai,
      document("gemini", geminiPayload),
    ]);
    const conflict = conflictDraft.reviewFlags.find(
      (item) => item.path === "questions.1.stem.en",
    )!;
    const firstReview = reconciliationModule.applyReviewDecisions(conflictDraft, [
      { flagId: conflict.id, resolution: "accept_primary" },
    ]);
    const corrected = reconciliationModule.applyReviewDecisions(firstReview, [
      {
        flagId: conflict.id,
        resolution: "manual_value",
        manualValue: "Corrected force question",
      },
    ]);

    expect(corrected.paper.questions[0].stem?.en).toBe(
      "Corrected force question",
    );
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

  it("preserves optional limits, correction dispositions, marking overrides, and official-key provenance", () => {
    const ruledPayload = payload();
    ruledPayload.paper.sections = [
      {
        id: "physics",
        subject: "physics",
        title: localized("Physics"),
        questionNumbers: ["1"],
        selectionLimit: 1,
      },
    ];
    ruledPayload.paper.questions[0].disposition = "bonus";
    ruledPayload.paper.questions[0].marking = {
      correct: 5,
      incorrect: -2,
      unattempted: 0,
    };
    const draft = reconcileExtractions([document("openai", ruledPayload)], {
      officialAnswerKey: { "1": ["B"] },
      officialAnswerKeyFileId: "official-key-file",
    });
    const reviewedDraft = {
      ...draft,
      reviewFlags: draft.reviewFlags.map((flag) => ({ ...flag, resolved: true })),
    };

    const version = buildPaperVersionFromImport(reviewedDraft, {
      id: "version-rules-1",
      paperId: "neet-rules",
      revision: 1,
      publishedAt: "2026-10-28T10:00:00.000Z",
    });

    expect(version.sections[0].selectionLimit).toBe(1);
    expect(version.questions[0]).toMatchObject({
      acceptedOptionIds: ["B"],
      disposition: "bonus",
      marking: { correct: 5, incorrect: -2, unattempted: 0 },
      answerKeyProvenance: {
        source: "official",
        reference: "official-key-file",
      },
    });
  });

  it("creates distinct immutable original-pattern and current-pattern versions", () => {
    const draft = reconcileExtractions([document("openai")]);
    const reviewedDraft = {
      ...draft,
      reviewFlags: draft.reviewFlags.map((flag) => ({ ...flag, resolved: true })),
    };
    const buildPublishedPaperVersionsFromImport = (
      reconciliationModule as typeof reconciliationModule & {
        buildPublishedPaperVersionsFromImport: (
          draft: ReturnType<typeof reconcileExtractions>,
          metadata: Record<string, unknown>,
        ) => { original: PaperVersion; current: PaperVersion };
      }
    ).buildPublishedPaperVersionsFromImport;

    const versions = buildPublishedPaperVersionsFromImport(reviewedDraft, {
      paperId: "neet-2025",
      originalId: "neet-2025-original-r1",
      originalRevision: 1,
      currentId: "neet-2025-current-r2",
      currentRevision: 2,
      publishedAt: "2026-10-28T10:00:00.000Z",
    });

    expect(versions.original).toMatchObject({
      id: "neet-2025-original-r1",
      revision: 1,
      pattern: "original",
    });
    expect(versions.current).toMatchObject({
      id: "neet-2025-current-r2",
      revision: 2,
      pattern: "current",
    });
    expect(versions.current).not.toBe(versions.original);
    expect(Object.isFrozen(versions.original)).toBe(true);
    expect(Object.isFrozen(versions.current)).toBe(true);
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
