import { z } from "zod";

import {
  SubmitAttemptRequestSchema,
  SubmitAttemptResponseSchema,
} from "@/features/exam/contracts";
import { submitAttemptRecord } from "@/features/exam/server/attempt-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  const user = await getRequestUser(request);

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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

  let result;

  try {
    result = await submitAttemptRecord(parsedId.data, user.id, Date.now());
  } catch {
    logServerEvent("error", "attempt.submit_failed", {
      attemptId: parsedId.data,
      userId: user.id,
    });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }

  return Response.json(SubmitAttemptResponseSchema.parse(result.response));
}
