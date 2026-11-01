import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as appendEvents } from "@/app/api/attempts/[attemptId]/events/route";
import { POST as submitAttempt } from "@/app/api/attempts/[attemptId]/submit/route";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import * as attemptStore from "@/features/exam/server/attempt-store";
import { createAttemptEventSyncController } from "@/features/exam/persistence";
import { finalizeSynchronizedAttempt, readAttemptResponse } from "@/features/exam/client-attempt";
import type { AnswerEvent } from "@/features/exam/session";

const startedAtMs = Date.parse("2026-10-28T10:00:00.000Z");

type CreatedAttempt = {
  attemptId: string;
  status: "active";
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
};

function authHeaders(userId = "student-current") {
  return {
    "x-medmock-user-id": userId,
    "x-medmock-role": "student",
  };
}

function attemptRequest(
  idempotencyKey: string,
  userId = "student-current",
  mode: "mock" | "practice" = "mock",
) {
  return new Request("http://localhost/api/attempts", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(userId) },
    body: JSON.stringify({
      paperVersionId: sampleExamPaper.id,
      mode,
      strict: mode === "mock",
      visibility: "public",
      idempotencyKey,
    }),
  });
}

async function startAttempt(
  idempotencyKey = crypto.randomUUID(),
  userId = "student-current",
  mode: "mock" | "practice" = "mock",
) {
  const response = await createAttempt(attemptRequest(idempotencyKey, userId, mode));
  const body = (await response.json()) as CreatedAttempt;
  return { response, body };
}

function routeContext(attemptId: string) {
  return { params: Promise.resolve({ attemptId }) };
}

function answerEvent(attemptId: string, eventId = crypto.randomUUID()) {
  return {
    id: eventId,
    attemptId,
    questionId: "physics-1",
    type: "answer_selected" as const,
    selectedOptionId: "B",
    occurredAt: startedAtMs + 1_000,
    clientSequence: 1,
    timeSpentMs: 42_000,
  };
}

function eventRequest(
  attemptId: string,
  events: ReturnType<typeof answerEvent>[],
  userId = "student-current",
) {
  return new Request("http://localhost/api/attempts/" + attemptId + "/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(userId) },
    body: JSON.stringify({ events }),
  });
}

function submissionRequest(attemptId: string, userId = "student-current") {
  return new Request("http://localhost/api/attempts/" + attemptId + "/submit", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(userId) },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attempt API contracts", () => {
  it("finalizes accepted server answers outside receipt grace and recovers a lost submitted acknowledgement", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const accepted = answerEvent(attempt.attemptId);
    await appendEvents(eventRequest(attempt.attemptId, [accepted]), routeContext(attempt.attemptId));
    const late = { ...answerEvent(attempt.attemptId), selectedOptionId: "A", clientSequence: 2 };
    let queue: AnswerEvent[] = [accepted, late];
    const rejected: AnswerEvent[] = [];
    vi.mocked(Date.now).mockReturnValue(Date.parse(attempt.deadlineAt) + 30_001);
    const controller = createAttemptEventSyncController({
      getEvents: () => queue,
      sendEvents: async (events) => readAttemptResponse(await appendEvents(new Request(`http://localhost/api/attempts/${attempt.attemptId}/events`, {
        method: "POST", headers: { ...authHeaders(), "content-type": "application/json" }, body: JSON.stringify({ events }),
      }), routeContext(attempt.attemptId))),
      acknowledge: async (ids) => { queue = queue.filter((event) => !ids.includes(event.id)); },
      reject: async (events) => { rejected.push(...events); queue = queue.filter((event) => !events.some((item) => item.id === event.id)); },
    });
    async function submitResponse() { return submitAttempt(submissionRequest(attempt.attemptId), routeContext(attempt.attemptId)); }
    const outcome = await finalizeSynchronizedAttempt({ sync: () => controller.request(), submit: async () => readAttemptResponse(await submitResponse()) });
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("Expected finalization");
    expect(outcome.result.result.score).toBe(4);
    expect(rejected.map((event) => event.id)).toEqual([late.id]);
    expect(queue).toEqual([]);

    const recovered = await finalizeSynchronizedAttempt({
      sync: async () => {
        const recovery = createAttemptEventSyncController({
          getEvents: () => [late],
          sendEvents: async () => readAttemptResponse(await appendEvents(eventRequest(attempt.attemptId, [late]), routeContext(attempt.attemptId))),
          acknowledge: async () => { throw new Error("Must preserve unacknowledged evidence"); },
        });
        return recovery.request();
      },
      submit: async () => readAttemptResponse(await submitResponse()),
    });
    expect(recovered).toMatchObject({ status: "complete", result: outcome.result, sync: { status: "submitted" } });
  });
  it("normalizes PostgREST offset timestamps at the persistent adapter boundary", () => {
    const normalizeAttemptDatabaseRow = (
      attemptStore as typeof attemptStore & {
        normalizeAttemptDatabaseRow: (
          row: Record<string, unknown>,
        ) => Record<string, unknown>;
      }
    ).normalizeAttemptDatabaseRow;

    expect(
      normalizeAttemptDatabaseRow({
        started_at: "2026-10-28T10:00:00+00:00",
        deadline_at: "2026-10-28T13:00:00+00:00",
        submitted_at: "2026-10-28T11:30:00+00:00",
      }),
    ).toMatchObject({
      started_at: "2026-10-28T10:00:00.000Z",
      deadline_at: "2026-10-28T13:00:00.000Z",
      submitted_at: "2026-10-28T11:30:00.000Z",
    });
  });

  it("rejects unauthenticated attempt creation", async () => {
    const response = await createAttempt(
      new Request("http://localhost/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paperVersionId: sampleExamPaper.id,
          mode: "mock",
          strict: true,
          visibility: "public",
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("replays attempt creation without creating a second timed attempt", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const idempotencyKey = crypto.randomUUID();

    const first = await startAttempt(idempotencyKey);
    const replay = await startAttempt(idempotencyKey);

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(first.body).toEqual({
      attemptId: expect.any(String),
      status: "active",
      startedAt: "2026-10-28T10:00:00.000Z",
      deadlineAt: "2026-10-28T13:00:00.000Z",
      serverNow: "2026-10-28T10:00:00.000Z",
    });
  });

  it("deduplicates a replayed answer-event batch", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const event = answerEvent(attempt.attemptId);

    const firstResponse = await appendEvents(
      eventRequest(attempt.attemptId, [event]),
      routeContext(attempt.attemptId),
    );
    const replayResponse = await appendEvents(
      eventRequest(attempt.attemptId, [event]),
      routeContext(attempt.attemptId),
    );

    await expect(firstResponse.json()).resolves.toEqual({
      acceptedEventIds: [event.id],
      duplicateEventIds: [],
      eventCount: 1,
    });
    await expect(replayResponse.json()).resolves.toEqual({
      acceptedEventIds: [],
      duplicateEventIds: [event.id],
      eventCount: 1,
    });
  });

  it("rejects an event id replayed with different answer data", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const event = answerEvent(attempt.attemptId);

    await appendEvents(
      eventRequest(attempt.attemptId, [event]),
      routeContext(attempt.attemptId),
    );
    const conflictResponse = await appendEvents(
      eventRequest(attempt.attemptId, [{ ...event, selectedOptionId: "A" }]),
      routeContext(attempt.attemptId),
    );

    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toEqual({
      error: "answer_event_conflict",
      eventId: event.id,
    });
  });

  it("does not reveal or mutate another student's attempt", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const event = answerEvent(attempt.attemptId);

    const eventResponse = await appendEvents(
      eventRequest(attempt.attemptId, [event], "student-intruder"),
      routeContext(attempt.attemptId),
    );
    const submitResponse = await submitAttempt(
      submissionRequest(attempt.attemptId, "student-intruder"),
      routeContext(attempt.attemptId),
    );

    expect(eventResponse.status).toBe(404);
    expect(submitResponse.status).toBe(404);
  });

  it("rejects answers recorded after the server-authoritative deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const lateEvent = {
      ...answerEvent(attempt.attemptId),
      occurredAt: Date.parse(attempt.deadlineAt) + 1,
    };

    const response = await appendEvents(
      eventRequest(attempt.attemptId, [lateEvent]),
      routeContext(attempt.attemptId),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "event_after_deadline",
      eventId: lateEvent.id,
    });
  });

  it("uses trusted receipt time for offline grace and flags late accepted events", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: graceAttempt } = await startAttempt();
    const graceDeadline = Date.parse(graceAttempt.deadlineAt);
    const backdatedInGrace = {
      ...answerEvent(graceAttempt.attemptId),
      occurredAt: graceDeadline - 1,
    };
    now.mockReturnValue(graceDeadline + 10_000);

    const graceResponse = await appendEvents(
      eventRequest(graceAttempt.attemptId, [backdatedInGrace]),
      routeContext(graceAttempt.attemptId),
    );
    expect(graceResponse.status).toBe(200);
    await expect(graceResponse.json()).resolves.toMatchObject({
      integrityStatus: "flagged",
    });

    now.mockReturnValue(startedAtMs);
    const { body: expiredAttempt } = await startAttempt();
    const expiredDeadline = Date.parse(expiredAttempt.deadlineAt);
    const backdatedBeyondGrace = {
      ...answerEvent(expiredAttempt.attemptId),
      occurredAt: expiredDeadline - 1,
    };
    now.mockReturnValue(expiredDeadline + 30_001);
    const rejected = await appendEvents(
      eventRequest(expiredAttempt.attemptId, [backdatedBeyondGrace]),
      routeContext(expiredAttempt.attemptId),
    );

    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({
      error: "event_after_deadline",
      eventId: backdatedBeyondGrace.id,
    });
  });

  it("locks the first practice answer on the server", async () => {
    vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt(
      crypto.randomUUID(),
      "student-current",
      "practice",
    );
    const first = answerEvent(attempt.attemptId);
    const second = {
      ...answerEvent(attempt.attemptId),
      id: crypto.randomUUID(),
      selectedOptionId: "A",
      clientSequence: 2,
      occurredAt: first.occurredAt + 1,
    };

    await appendEvents(
      eventRequest(attempt.attemptId, [first]),
      routeContext(attempt.attemptId),
    );
    const response = await appendEvents(
      eventRequest(attempt.attemptId, [second]),
      routeContext(attempt.attemptId),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "practice_answer_locked",
      eventId: second.id,
    });
  });

  it("returns the same finalized result when submission is replayed", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const event = answerEvent(attempt.attemptId);
    await appendEvents(
      eventRequest(attempt.attemptId, [event]),
      routeContext(attempt.attemptId),
    );

    now.mockReturnValue(startedAtMs + 2_000);
    const firstResponse = await submitAttempt(
      submissionRequest(attempt.attemptId),
      routeContext(attempt.attemptId),
    );
    const firstBody = await firstResponse.json();

    now.mockReturnValue(startedAtMs + sampleExamPaper.durationMinutes * 60_000 + 10_000);
    const replayResponse = await submitAttempt(
      submissionRequest(attempt.attemptId),
      routeContext(attempt.attemptId),
    );
    const replayBody = await replayResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(replayResponse.status).toBe(200);
    expect(replayBody).toEqual(firstBody);
    expect(firstBody).toMatchObject({
      attemptId: attempt.attemptId,
      status: "submitted",
      submissionReason: "manual",
      submittedAt: "2026-10-28T10:00:02.000Z",
      result: {
        attemptId: attempt.attemptId,
        paperVersionId: sampleExamPaper.id,
        score: 4,
      },
    });
  });

  it("uses the server deadline to classify a late submission as expired", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAtMs);
    const { body: attempt } = await startAttempt();
    const expiredAt = startedAtMs + sampleExamPaper.durationMinutes * 60_000;
    now.mockReturnValue(expiredAt);

    const response = await submitAttempt(
      submissionRequest(attempt.attemptId),
      routeContext(attempt.attemptId),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attemptId: attempt.attemptId,
      status: "submitted",
      submissionReason: "expired",
      submittedAt: new Date(expiredAt).toISOString(),
    });
  });
});
