import { z } from "zod";

import { SubjectSchema } from "@/features/exam/domain";

export const ExtractionProviderIdSchema = z.enum(["openai", "gemini"]);
export const ProviderSelectionSchema = z.enum(["openai", "gemini", "both"]);

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
    text: PartialLocalizedTextSchema,
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
    confidence: FieldConfidenceSchema.default({}),
  })
  .strict();

export const ExtractionPaperSchema = z
  .object({
    title: PartialLocalizedTextSchema.optional(),
    year: z.number().int().min(2000).max(2200).nullable().optional(),
    durationMinutes: z.number().int().positive().nullable().optional(),
    questions: z.array(ExtractionQuestionSchema).default([]),
  })
  .strict();

export const ExtractionPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    paper: ExtractionPaperSchema,
  })
  .strict();

export const ExtractionSourceSchema = z
  .object({
    fileId: z.string().trim().min(1),
    fileName: z.string().trim().min(1),
    mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  })
  .strict();

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

export const extractionResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "paper"],
  properties: {
    schemaVersion: { type: "number", enum: [1] },
    paper: {
      type: "object",
      additionalProperties: false,
      required: ["title", "year", "durationMinutes", "questions"],
      properties: {
        title: { type: "object" },
        year: { type: ["number", "null"] },
        durationMinutes: { type: ["number", "null"] },
        questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "sourceNumber", "sectionId", "subject", "topic", "stem",
              "options", "acceptedOptionIds", "solution", "confidence",
            ],
            properties: {
              sourceNumber: { type: "string" },
              sectionId: { type: ["string", "null"] },
              subject: { type: ["string", "null"], enum: ["physics", "chemistry", "biology", null] },
              topic: { type: ["string", "null"] },
              stem: { type: ["object", "null"] },
              options: { type: "array", items: { type: "object" } },
              acceptedOptionIds: { type: "array", items: { type: "string" } },
              solution: { type: ["object", "null"] },
              confidence: { type: "object" },
            },
          },
        },
      },
    },
  },
} as const;
