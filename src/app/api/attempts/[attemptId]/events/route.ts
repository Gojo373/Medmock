import { z } from "zod";

import {
  AppendAnswerEventsRequestSchema,
  AppendAnswerEventsResponseSchema,
} from "@/features/exam/contracts";
import { appendAttemptEvents } from "@/features/exam/server/attempt-store";

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
  const parsed = AppendAnswerEventsRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_answer_event_batch", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = appendAttemptEvents(parsedId.data, parsed.data.events);

  if (!result.ok) {
    if (result.error === "attempt_not_found") {
      return Response.json({ error: result.error }, { status: 404 });
    }

    const status = result.error === "invalid_answer_event" ? 400 : 409;
    return Response.json(
      { error: result.error, ...(result.eventId ? { eventId: result.eventId } : {}) },
      { status },
    );
  }

  return Response.json(AppendAnswerEventsResponseSchema.parse(result.response));
}
