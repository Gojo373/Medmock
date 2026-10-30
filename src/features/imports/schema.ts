import { z } from "zod";

import {
  AnswerKeyProvenanceSchema,
  MarkingSchemeSchema,
  QuestionDispositionSchema,
  SubjectSchema,
} from "@/features/exam/domain";

export const ExtractionProviderIdSchema = z.enum([
  "openai",
  "gemini",
  "agentrouter",
]);
export const ProviderSelectionSchema = z.enum([
  "openai",
  "gemini",
  "agentrouter",
  "both",
]);

export const PartialLocalizedTextSchema = z
  .object({
    en: z.string().trim().min(1).optional(),
    hi: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.en || value.hi), {
    message: "At least one localized value is required.",
  });

export const ExtractionOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    text: PartialLocalizedTextSchema.optional(),
  })
  .strict();

export const FieldConfidenceSchema = z
  .object({
    stem: z.number().min(0).max(1).optional(),
    options: z.number().min(0).max(1).optional(),
    answerKey: z.number().min(0).max(1).optional(),
    translation: z.number().min(0).max(1).optional(),
    solution: z.number().min(0).max(1).optional(),
  })
  .strict();

export const ExtractionQuestionSchema = z
  .object({
    sourceNumber: z.string().trim().min(1),
    sectionId: z.string().trim().min(1).optional(),
    subject: SubjectSchema.optional(),
    topic: z.string().trim().min(1).optional(),
    stem: PartialLocalizedTextSchema.optional(),
    options: z.array(ExtractionOptionSchema).default([]),
    acceptedOptionIds: z.array(z.string().trim().min(1)).default([]),
    solution: PartialLocalizedTextSchema.optional(),
    disposition: QuestionDispositionSchema.default("standard"),
    marking: MarkingSchemeSchema.default({
      correct: 4,
      incorrect: -1,
      unattempted: 0,
    }),
    answerKeyProvenance: AnswerKeyProvenanceSchema.default({
      source: "provider",
    }),
    confidence: FieldConfidenceSchema.default({}),
  })
  .strict();

export const ExtractionSectionSchema = z
  .object({
    id: z.string().trim().min(1),
    subject: SubjectSchema,
    title: PartialLocalizedTextSchema,
    questionNumbers: z.array(z.string().trim().min(1)).min(1),
    selectionLimit: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const ExtractionPaperSchema = z
  .object({
    title: PartialLocalizedTextSchema.optional(),
    year: z.number().int().min(2000).max(2200).nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    sections: z.array(ExtractionSectionSchema).default([]),
    questions: z.array(ExtractionQuestionSchema).default([]),
  })
  .strict();

export const OfficialAnswerKeyEntrySchema = z
  .object({
    sourceNumber: z.string().trim().min(1),
    acceptedOptionIds: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const ExtractionPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    paper: ExtractionPaperSchema,
    officialAnswerKeyEntries: z.array(OfficialAnswerKeyEntrySchema).default([]),
  })
  .strict();

export const ExtractionFileSourceSchema = z
  .object({
    fileId: z.string().trim().min(1),
    fileName: z.string().trim().min(1),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  })
  .strict();

export const ExtractionSourceSchema = ExtractionFileSourceSchema.extend({
  answerKey: ExtractionFileSourceSchema.optional(),
  solution: ExtractionFileSourceSchema.optional(),
}).strict();

export const ExtractionDocumentSchema = ExtractionPayloadSchema.extend({
  provider: ExtractionProviderIdSchema,
  source: ExtractionSourceSchema,
}).strict();

export const ReviewFlagSchema = z
  .object({
    id: z.string().trim().min(1),
    code: z.enum([
      "admin_review",
      "provider_conflict",
      "low_confidence",
      "missing_field",
      "invalid_answer_key",
    ]),
    path: z.string().trim().min(1),
    message: z.string().trim().min(1),
    severity: z.enum(["warning", "error"]),
    resolved: z.boolean(),
    providerValues: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const ReconciledImportSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal("review_required"),
    providers: z.array(ExtractionProviderIdSchema).min(1),
    paper: ExtractionPaperSchema,
    reviewFlags: z.array(ReviewFlagSchema),
  })
  .strict();

export type ExtractionProviderId = z.infer<typeof ExtractionProviderIdSchema>;
export type ProviderSelection = z.infer<typeof ProviderSelectionSchema>;
export type ExtractionPayload = z.infer<typeof ExtractionPayloadSchema>;
export type ExtractionSource = z.infer<typeof ExtractionSourceSchema>;
export type ExtractionDocument = z.infer<typeof ExtractionDocumentSchema>;
export type ExtractionQuestion = z.infer<typeof ExtractionQuestionSchema>;
export type ExtractionPaper = z.infer<typeof ExtractionPaperSchema>;
export type ReviewFlag = z.infer<typeof ReviewFlagSchema>;
export type ReconciledImport = z.infer<typeof ReconciledImportSchema>;

function normalizeLocalizedProviderValue(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const localized = value as Record<string, unknown>;
  const result = {
    ...(typeof localized.en === "string" ? { en: localized.en } : {}),
    ...(typeof localized.hi === "string" ? { hi: localized.hi } : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function omitNullValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null),
  );
}

export function normalizeProviderExtractionPayload(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const payload = value as Record<string, unknown>;
  const paper =
    payload.paper && typeof payload.paper === "object"
      ? (payload.paper as Record<string, unknown>)
      : {};
  const questions = Array.isArray(paper.questions) ? paper.questions : [];

  return {
    ...payload,
    paper: {
      ...paper,
      title: normalizeLocalizedProviderValue(paper.title),
      questions: questions.map((value) => {
        if (!value || typeof value !== "object") return value;
        const question = value as Record<string, unknown>;
        const options = Array.isArray(question.options) ? question.options : [];
        return {
          ...question,
          sectionId: question.sectionId ?? undefined,
          subject: question.subject ?? undefined,
          topic: question.topic ?? undefined,
          stem: normalizeLocalizedProviderValue(question.stem),
          solution: normalizeLocalizedProviderValue(question.solution),
          options: options.map((value) => {
            if (!value || typeof value !== "object") return value;
            const option = value as Record<string, unknown>;
            return {
              ...option,
              text: normalizeLocalizedProviderValue(option.text),
            };
          }),
          confidence: omitNullValues(question.confidence),
          answerKeyProvenance: omitNullValues(question.answerKeyProvenance),
        };
      }),
    },
  };
}

const nullableLocalizedTextJsonSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["en", "hi"],
  properties: {
    en: { type: ["string", "null"] },
    hi: { type: ["string", "null"] },
  },
} as const;

const markingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["correct", "incorrect", "unattempted"],
  properties: {
    correct: { type: "number" },
    incorrect: { type: "number" },
    unattempted: { type: "number" },
  },
} as const;

const confidenceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["stem", "options", "answerKey", "translation", "solution"],
  properties: {
    stem: { type: ["number", "null"] },
    options: { type: ["number", "null"] },
    answerKey: { type: ["number", "null"] },
    translation: { type: ["number", "null"] },
    solution: { type: ["number", "null"] },
  },
} as const;

export const extractionResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "paper", "officialAnswerKeyEntries"],
  properties: {
    schemaVersion: { type: "number", enum: [1] },
    paper: {
      type: "object",
      additionalProperties: false,
      required: ["title", "year", "durationMinutes", "sections", "questions"],
      properties: {
        title: nullableLocalizedTextJsonSchema,
        year: { type: ["integer", "null"] },
        durationMinutes: { type: ["integer", "null"] },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "subject", "title", "questionNumbers", "selectionLimit"],
            properties: {
              id: { type: "string" },
              subject: { type: "string", enum: ["physics", "chemistry", "biology"] },
              title: nullableLocalizedTextJsonSchema,
              questionNumbers: { type: "array", items: { type: "string" } },
              selectionLimit: { type: ["number", "null"] },
            },
          },
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "sourceNumber", "sectionId", "subject", "topic", "stem",
              "options", "acceptedOptionIds", "solution", "confidence",
              "disposition", "marking", "answerKeyProvenance",
            ],
            properties: {
              sourceNumber: { type: "string" },
              sectionId: { type: ["string", "null"] },
              subject: { type: ["string", "null"], enum: ["physics", "chemistry", "biology", null] },
              topic: { type: ["string", "null"] },
              stem: nullableLocalizedTextJsonSchema,
              options: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "text"],
                  properties: {
                    id: { type: "string" },
                    text: nullableLocalizedTextJsonSchema,
                  },
                },
              },
              acceptedOptionIds: { type: "array", items: { type: "string" } },
              solution: nullableLocalizedTextJsonSchema,
              disposition: { type: "string", enum: ["standard", "bonus", "dropped"] },
              marking: markingJsonSchema,
              answerKeyProvenance: {
                type: "object",
                additionalProperties: false,
                required: ["source", "reference"],
                properties: {
                  source: {
                    type: "string",
                    enum: ["provider", "official", "manual"],
                  },
                  reference: { type: ["string", "null"] },
                },
              },
              confidence: confidenceJsonSchema,
            },
          },
        },
      },
    },
    officialAnswerKeyEntries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceNumber", "acceptedOptionIds"],
        properties: {
          sourceNumber: { type: "string" },
          acceptedOptionIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;
