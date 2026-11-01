import { AppendAnswerEventsResponseSchema, SubmitAttemptResponseSchema } from "@/features/exam/contracts";

export class AttemptSyncError extends Error {
  constructor(readonly code: string, readonly eventId?: string) { super(code); }
}

export type EventSyncOutcome =
  | { status: "drained" }
  | { status: "rejected"; rejectedEventIds: string[] }
  | { status: "submitted" }
  | { status: "blocked"; code: string };

export async function readAttemptResponse(response: Response) {
  const payload = await response.json();
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new Error("Attempt service unavailable");
    throw new AttemptSyncError(payload.error ?? "request_rejected", payload.eventId);
  }
  return payload;
}

export async function sendAttemptEvents(attemptId: string, events: unknown[]) {
  return AppendAnswerEventsResponseSchema.parse(await readAttemptResponse(await fetch(`/api/attempts/${attemptId}/events`, {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }),
  })));
}

export async function submitServerAttempt(attemptId: string) {
  return SubmitAttemptResponseSchema.parse(await readAttemptResponse(await fetch(`/api/attempts/${attemptId}/submit`, {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: `submit:${attemptId}` }),
  })));
}

export async function finalizeSynchronizedAttempt<T extends { submittedAt: string }>({ sync, submit }: {
  sync: () => Promise<EventSyncOutcome>;
  submit: () => Promise<T>;
}) {
  try {
    const outcome = await sync();
    if (outcome.status === "blocked") return outcome;
    return { status: "complete" as const, result: await submit(), sync: outcome };
  } catch (error) {
    return error instanceof AttemptSyncError
      ? { status: "blocked" as const, code: error.code }
      : { status: "retry" as const };
  }
}

export function calculateServerClockOffset(startedAt: number, receivedAt: number, serverNow: string) {
  const serverTime = Date.parse(serverNow);
  if (!Number.isFinite(serverTime)) throw new Error("Invalid server clock.");
  return Math.round(serverTime - (startedAt + receivedAt) / 2);
}
