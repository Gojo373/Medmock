import { z } from "zod";

export const SubjectSchema = z.enum(["physics", "chemistry", "biology"]);

export const LocalizedTextSchema = z
  .object({
    en: z.string().trim().min(1),
    hi: z.string().trim().min(1),
  })
  .strict();

export const QuestionOptionSchema = z
  .object({
    id: z.string().trim().min(1),
    text: LocalizedTextSchema,
  })
  .strict();

export const MarkingSchemeSchema = z
  .object({
    correct: z.number().positive(),
    incorrect: z.number().nonpositive(),
    unattempted: z.number(),
  })
  .strict();

export const QuestionDispositionSchema = z.enum(["standard", "bonus", "dropped"]);

export const QuestionSchema = z
  .object({
    id: z.string().trim().min(1),
    sectionId: z.string().trim().min(1),
    subject: SubjectSchema,
    topic: z.string().trim().min(1),
    stem: LocalizedTextSchema,
    options: z.array(QuestionOptionSchema).min(2),
    acceptedOptionIds: z.array(z.string().trim().min(1)).default([]),
    solution: LocalizedTextSchema.optional(),
    disposition: QuestionDispositionSchema.default("standard"),
    marking: MarkingSchemeSchema,
  })
  .strict()
  .superRefine((question, context) => {
    const optionIds = new Set(question.options.map((option) => option.id));

    if (optionIds.size !== question.options.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Option identifiers must be unique.",
      });
    }

    if (question.disposition === "standard" && question.acceptedOptionIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["acceptedOptionIds"],
        message: "A standard question needs at least one accepted option.",
      });
    }

    for (const acceptedOptionId of question.acceptedOptionIds) {
      if (!optionIds.has(acceptedOptionId)) {
        context.addIssue({
          code: "custom",
          path: ["acceptedOptionIds"],
          message: "Accepted options must reference an option on the question.",
        });
      }
    }
  });

export const PaperSectionSchema = z
  .object({
    id: z.string().trim().min(1),
    subject: SubjectSchema,
    title: LocalizedTextSchema,
    questionIds: z.array(z.string().trim().min(1)).min(1),
    selectionLimit: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((section, context) => {
    if (new Set(section.questionIds).size !== section.questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["questionIds"],
        message: "A section cannot reference the same question twice.",
      });
    }

    if (section.selectionLimit && section.selectionLimit > section.questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["selectionLimit"],
        message: "The selection limit cannot exceed the section question count.",
      });
    }
  });

export const PaperVersionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1),
    paperId: z.string().trim().min(1),
    revision: z.number().int().positive(),
    status: z.enum(["draft", "review", "published", "archived"]),
    title: LocalizedTextSchema,
    durationMinutes: z.number().int().positive(),
    publishedAt: z.string().datetime().optional(),
    sections: z.array(PaperSectionSchema).min(1),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict()
  .superRefine((paper, context) => {
    const sectionIds = new Set(paper.sections.map((section) => section.id));
    const questionIds = new Set(paper.questions.map((question) => question.id));

    if (sectionIds.size !== paper.sections.length) {
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Section identifiers must be unique.",
      });
    }

    if (questionIds.size !== paper.questions.length) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Question identifiers must be unique.",
      });
    }

    for (const section of paper.sections) {
      for (const questionId of section.questionIds) {
        const question = paper.questions.find((item) => item.id === questionId);

        if (!question) {
          context.addIssue({
            code: "custom",
            path: ["sections"],
            message: "Every section question must exist in the paper version.",
          });
          continue;
        }

        if (question.sectionId !== section.id || question.subject !== section.subject) {
          context.addIssue({
            code: "custom",
            path: ["sections"],
            message: "Question section and subject metadata must match its section.",
          });
        }
      }
    }

    for (const question of paper.questions) {
      if (!sectionIds.has(question.sectionId)) {
        context.addIssue({
          code: "custom",
          path: ["questions"],
          message: "Every question must reference an existing section.",
        });
      }
    }

    if (paper.status === "published" && !paper.publishedAt) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "Published versions require a publication timestamp.",
      });
    }
  });

export const AttemptAnswerSchema = z
  .object({
    questionId: z.string().trim().min(1),
    selectedOptionId: z.string().trim().min(1),
    answeredAt: z.string().datetime(),
    timeSpentMs: z.number().int().nonnegative(),
  })
  .strict();

export const AttemptSchema = z
  .object({
    id: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    paperVersionId: z.string().trim().min(1),
    mode: z.enum(["mock", "practice"]),
    strict: z.boolean(),
    attemptNumber: z.number().int().positive(),
    visibility: z.enum(["public", "private"]).default("public"),
    integrityStatus: z.enum(["clear", "flagged"]).default("clear"),
    startedAt: z.string().datetime(),
    deadlineAt: z.string().datetime().optional(),
    submittedAt: z.string().datetime().optional(),
    answers: z.array(AttemptAnswerSchema),
  })
  .strict()
  .superRefine((attempt, context) => {
    const answerQuestionIds = attempt.answers.map((answer) => answer.questionId);

    if (new Set(answerQuestionIds).size !== answerQuestionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "An attempt can contain only one current answer per question.",
      });
    }
  });

export const QuestionResultStatusSchema = z.enum([
  "correct",
  "incorrect",
  "unanswered",
  "bonus",
  "dropped",
  "ignored",
]);

export const QuestionResultSchema = z
  .object({
    questionId: z.string(),
    subject: SubjectSchema,
    status: QuestionResultStatusSchema,
    selectedOptionId: z.string().optional(),
    awardedMarks: z.number(),
    maxMarks: z.number().nonnegative(),
  })
  .strict();

export const SubjectScoreSchema = z
  .object({
    score: z.number(),
    maxScore: z.number().nonnegative(),
    correct: z.number().int().nonnegative(),
    incorrect: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    bonus: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
  })
  .strict();

export const AttemptResultSchema = z
  .object({
    attemptId: z.string(),
    paperVersionId: z.string(),
    score: z.number(),
    maxScore: z.number().nonnegative(),
    correct: z.number().int().nonnegative(),
    incorrect: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    bonus: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
    questionResults: z.array(QuestionResultSchema),
    subjectTotals: z
      .object({
        physics: SubjectScoreSchema,
        chemistry: SubjectScoreSchema,
        biology: SubjectScoreSchema,
      })
      .strict(),
  })
  .strict();

export type Subject = z.infer<typeof SubjectSchema>;
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type PaperSection = z.infer<typeof PaperSectionSchema>;
export type PaperVersion = z.infer<typeof PaperVersionSchema>;
export type AttemptAnswer = z.infer<typeof AttemptAnswerSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type QuestionResult = z.infer<typeof QuestionResultSchema>;
export type SubjectScore = z.infer<typeof SubjectScoreSchema>;
export type AttemptResult = z.infer<typeof AttemptResultSchema>;
