import { z } from "zod";

import { AttemptResultSchema } from "@/features/exam/domain";

export const AnswerEventSchema = z
  .object({
    id: z.string().trim().min(1),
    attemptId: z.string().uuid(),
    questionId: z.string().trim().min(1),
    type: z.enum(["answer_selected", "answer_cleared"]),
    selectedOptionId: z.string().trim().min(1).optional(),
    occurredAt: z.number().int().nonnegative(),
    clientSequence: z.number().int().positive(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.type === "answer_selected" && !event.selectedOptionId) {
      context.addIssue({
        code: "custom",
        path: ["selectedOptionId"],
        message: "Selected-answer events require an option.",
      });
    }

    if (event.type === "answer_cleared" && event.selectedOptionId) {
      context.addIssue({
        code: "custom",
        path: ["selectedOptionId"],
        message: "Cleared-answer events cannot include an option.",
      });
    }
  });

export const CreateAttemptRequestSchema = z
  .object({
    paperVersionId: z.string().trim().min(1),
    mode: z.enum(["mock", "practice"]),
    strict: z.boolean(),
    visibility: z.enum(["public", "private"]),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const CreateAttemptResponseSchema = z
  .object({
    attemptId: z.string().uuid(),
    status: z.literal("active"),
    startedAt: z.string().datetime(),
    deadlineAt: z.string().datetime(),
  })
  .strict();

export const AppendAnswerEventsRequestSchema = z
  .object({
    events: z.array(AnswerEventSchema).min(1).max(500),
  })
  .strict();

export const AppendAnswerEventsResponseSchema = z
  .object({
    acceptedEventIds: z.array(z.string()),
    duplicateEventIds: z.array(z.string()),
    eventCount: z.number().int().nonnegative(),
  })
  .strict();

export const SubmitAttemptRequestSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

export const SubmitAttemptResponseSchema = z
  .object({
    attemptId: z.string().uuid(),
    status: z.literal("submitted"),
    submissionReason: z.enum(["manual", "expired"]),
    submittedAt: z.string().datetime(),
    result: AttemptResultSchema,
  })
  .strict();

export type AnswerEventContract = z.infer<typeof AnswerEventSchema>;
export type CreateAttemptRequest = z.infer<typeof CreateAttemptRequestSchema>;
export type CreateAttemptResponse = z.infer<typeof CreateAttemptResponseSchema>;
export type AppendAnswerEventsResponse = z.infer<
  typeof AppendAnswerEventsResponseSchema
>;
export type SubmitAttemptResponse = z.infer<typeof SubmitAttemptResponseSchema>;
