import { z } from "zod";

import {
  ExtractionSourceSchema,
  ProviderSelectionSchema,
} from "@/features/imports/schema";

export const CreateImportRequestSchema = z
  .object({
    source: ExtractionSourceSchema,
    providerSelection: ProviderSelectionSchema,
    answerKeyFileId: z.string().trim().min(1).optional(),
    solutionFileId: z.string().trim().min(1).optional(),
  })
  .strict();

export const CreateImportResponseSchema = z
  .object({
    importId: z.string().uuid(),
    status: z.literal("uploaded"),
  })
  .strict();

export const ImportStatusResponseSchema = z
  .object({
    importId: z.string().uuid(),
    status: z.enum([
      "uploaded",
      "extracting",
      "review_required",
      "ready_to_publish",
      "published",
      "failed",
    ]),
    reviewFlagCount: z.number().int().nonnegative(),
  })
  .strict();

export const ReviewFlagDecisionSchema = z
  .object({
    flagId: z.string().trim().min(1),
    resolution: z.enum(["accept_primary", "accept_secondary", "manual_value"]),
    manualValue: z.unknown().optional(),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.resolution === "manual_value" && decision.manualValue === undefined) {
      context.addIssue({
        code: "custom",
        path: ["manualValue"],
        message: "Manual resolutions require a value.",
      });
    }
  });

export const PublishImportRequestSchema = z
  .object({
    approved: z.literal(true),
    paperId: z.string().trim().min(1),
    revision: z.number().int().positive(),
  })
  .strict();

export type CreateImportRequest = z.infer<typeof CreateImportRequestSchema>;
