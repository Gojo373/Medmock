import { describe, expect, it } from "vitest";
import { calculateServerClockOffset } from "@/features/exam/client-attempt";
import * as clientAttempt from "@/features/exam/client-attempt";
import { AnswerEventSchema } from "@/features/exam/contracts";
import { createAttemptEventSyncController } from "@/features/exam/persistence";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { createExamSession, examSessionReducer, type AnswerEvent } from "@/features/exam/session";

describe("production attempt synchronization", () => {
  it("freezes expiry events across repeated finalizing ticks", () => {
    const state = createExamSession({ attemptId: crypto.randomUUID(), paper: sampleExamPaper, mode: "mock", nowMs: 1_000, deadlineAtMs: 2_000 });
    const expired = examSessionReducer(state, { type: "TICK", eventId: "expiry", nowMs: 2_001 });
    const repeated = examSessionReducer(expired, { type: "TICK", eventId: "again", nowMs: 9_000 });
    expect(repeated.eventQueue).toEqual(expired.eventQueue);
    expect(repeated.nextClientSequence).toBe(expired.nextClientSequence);
  });

  it("retains rejected late events and finalizes accepted server state", async () => {
    let queue: AnswerEvent[] = [{ id: "late", attemptId: crypto.randomUUID(), questionId: "physics-1", type: "time_spent" as const, occurredAt: 2_000, timeSpentMs: 1_000, clientSequence: 1 }];
    const retained: typeof queue = [];
    const controller = createAttemptEventSyncController({
      getEvents: () => queue,
      sendEvents: async () => { throw new clientAttempt.AttemptSyncError("event_after_deadline", "late"); },
      acknowledge: async () => {},
      reject: async (events) => { retained.push(...events); queue = []; },
    });
    await expect(controller.request()).resolves.toEqual({ status: "rejected", rejectedEventIds: ["late"] });
    expect(retained).toHaveLength(1);
    await expect(clientAttempt.finalizeSynchronizedAttempt({ sync: () => controller.request(), submit: async () => ({ submittedAt: "2026-11-01T10:00:00.000Z" }) })).resolves.toMatchObject({ status: "complete" });
  });

  it("recovers submitted acknowledgement without discarding queued evidence", async () => {
    const queue = [{ id: "pending", attemptId: crypto.randomUUID(), questionId: "physics-1", type: "time_spent" as const, occurredAt: 2_000, timeSpentMs: 1_000, clientSequence: 1 }];
    const controller = createAttemptEventSyncController({
      getEvents: () => queue,
      sendEvents: async () => { throw new clientAttempt.AttemptSyncError("attempt_submitted"); },
      acknowledge: async () => {},
    });
    await expect(clientAttempt.finalizeSynchronizedAttempt({ sync: () => controller.request(), submit: async () => ({ submittedAt: "2026-11-01T10:00:00.000Z" }) })).resolves.toMatchObject({ status: "complete", sync: { status: "submitted" } });
    expect(queue).toHaveLength(1);
  });

  it("stops permanent failures while retaining recoverable queue entries", async () => {
    const queue = [{ id: "pending", attemptId: crypto.randomUUID(), questionId: "physics-1", type: "time_spent" as const, occurredAt: 2_000, timeSpentMs: 1_000, clientSequence: 1 }];
    let requests = 0;
    const controller = createAttemptEventSyncController({
      getEvents: () => queue,
      sendEvents: async () => { requests++; throw new clientAttempt.AttemptSyncError("answer_event_conflict", "pending"); },
      acknowledge: async () => {},
    });
    await expect(controller.request()).resolves.toMatchObject({ status: "blocked" });
    await expect(controller.request()).resolves.toMatchObject({ status: "blocked" });
    expect(requests).toBe(1);
    expect(queue).toHaveLength(1);
  });
  it("synchronizes an answer after an odd-millisecond server round trip", async () => {
    const offset = calculateServerClockOffset(1_000, 1_101, new Date(1_050).toISOString());
    let state = createExamSession({ attemptId: crypto.randomUUID(), paper: sampleExamPaper, mode: "mock", nowMs: 1_000, deadlineAtMs: 10_000 });
    state = examSessionReducer(state, { type: "SELECT_OPTION", eventId: "odd-rtt", questionId: "physics-1", optionId: "A", occurredAt: 1_102 + offset });
    const controller = createAttemptEventSyncController({
      getEvents: () => state.eventQueue,
      sendEvents: async (events) => {
        events.forEach((event) => AnswerEventSchema.parse(event));
        return { acceptedEventIds: events.map((event) => event.id), duplicateEventIds: [] };
      },
      acknowledge: async (eventIds) => { state = examSessionReducer(state, { type: "ACK_EVENTS", eventIds }); },
    });
    await controller.request();
    expect(state.eventQueue).toEqual([]);
    expect(Number.isInteger(state.timeSpentByQuestionMs["physics-1"])).toBe(true);
  });
});
