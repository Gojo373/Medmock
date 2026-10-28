import { z } from "zod";

import {
  SubmitAttemptRequestSchema,
  SubmitAttemptResponseSchema,
} from "@/features/exam/contracts";
import { submitAttemptRecord } from "@/features/exam/server/attempt-store";

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await context.params;
  const parsedId = z.string().uuid().safeParse(attemptId);

  if (!parsedId.success) {
    return Response.json({ error: "invalid_attempt_id" }, { status: 400 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = SubmitAttemptRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_submission_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = submitAttemptRecord(parsedId.data, Date.now());

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }

  return Response.json(SubmitAttemptResponseSchema.parse(result.response));
}
