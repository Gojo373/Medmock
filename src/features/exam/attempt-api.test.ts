import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as appendEvents } from "@/app/api/attempts/[attemptId]/events/route";
import { POST as submitAttempt } from "@/app/api/attempts/[attemptId]/submit/route";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

const startedAtMs = Date.parse("2026-10-28T10:00:00.000Z");

type CreatedAttempt = {
  attemptId: string;
  status: "active";
  startedAt: string;
  deadlineAt: string;
};

function attemptRequest(idempotencyKey: string) {
  return new Request("http://localhost/api/attempts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      paperVersionId: sampleExamPaper.id,
      mode: "mock",
      strict: true,
      visibility: "public",
      idempotencyKey,
    }),
  });
}

async function startAttempt(idempotencyKey = crypto.randomUUID()) {
  const response = await createAttempt(attemptRequest(idempotencyKey));
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
  };
}

function eventRequest(attemptId: string, events: ReturnType<typeof answerEvent>[]) {
  return new Request("http://localhost/api/attempts/" + attemptId + "/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

function submissionRequest(attemptId: string) {
  return new Request("http://localhost/api/attempts/" + attemptId + "/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attempt API contracts", () => {
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
