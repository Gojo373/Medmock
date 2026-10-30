import { describe, expect, it, vi } from "vitest";

import * as persistence from "@/features/exam/persistence";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { createExamSession } from "@/features/exam/session";
import type { AnswerEvent } from "@/features/exam/session";

function event(id: string, clientSequence: number): AnswerEvent {
  return {
    id,
    attemptId: "attempt-1",
    questionId: "physics-1",
    type: "answer_selected",
    selectedOptionId: "A",
    occurredAt: 1_000 + clientSequence,
    clientSequence,
    timeSpentMs: clientSequence * 1_000,
  };
}

describe("attempt event synchronization", () => {
  it("drains offline events in ordered batches of at most 500", async () => {
    let queue = Array.from({ length: 501 }, (_, index) =>
      event(`event-${index + 1}`, index + 1),
    );
    const batchSizes: number[] = [];
    const sentSequences: number[] = [];
    const controller = persistence.createAttemptEventSyncController({
      getEvents: () => queue,
      sendEvents: async (events) => {
        batchSizes.push(events.length);
        sentSequences.push(...events.map((item) => item.clientSequence));
        return {
          acceptedEventIds: events.map((item) => item.id),
          duplicateEventIds: [],
        };
      },
      acknowledge: async (eventIds) => {
        const accepted = new Set(eventIds);
        queue = queue.filter((item) => !accepted.has(item.id));
      },
    });

    await controller.request();

    expect(batchSizes).toEqual([500, 1]);
    expect(sentSequences).toEqual(Array.from({ length: 501 }, (_, index) => index + 1));
    expect(queue).toEqual([]);
  });

  it("serializes overlapping sync requests and drains events queued in flight", async () => {
    let queue = [event("event-1", 1)];
    let resolveFirst!: (value: {
      acceptedEventIds: string[];
      duplicateEventIds: string[];
    }) => void;
    const firstResponse = new Promise<{
      acceptedEventIds: string[];
      duplicateEventIds: string[];
    }>((resolve) => {
      resolveFirst = resolve;
    });
    const sendEvents = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({
        acceptedEventIds: ["event-2"],
        duplicateEventIds: [],
      });
    const acknowledge = vi.fn(async (eventIds: string[]) => {
      const acknowledged = new Set(eventIds);
      queue = queue.filter((item) => !acknowledged.has(item.id));
    });
    const controller = (persistence as typeof persistence & {
      createAttemptEventSyncController: typeof import("@/features/exam/persistence")["createAttemptEventSyncController"];
    }).createAttemptEventSyncController({
      getEvents: () => queue,
      sendEvents,
      acknowledge,
    });

    const firstRun = controller.request();
    queue = [...queue, event("event-2", 2)];
    const overlappingRun = controller.request();

    expect(sendEvents).toHaveBeenCalledTimes(1);
    expect(overlappingRun).toBe(firstRun);

    resolveFirst({ acceptedEventIds: ["event-1"], duplicateEventIds: [] });
    await firstRun;

    expect(sendEvents).toHaveBeenCalledTimes(2);
    expect(sendEvents.mock.calls.map(([events]) => events.map((item: AnswerEvent) => item.id))).toEqual([
      ["event-1"],
      ["event-2"],
    ]);
    expect(queue).toEqual([]);
  });

  it("normalizes legacy saved sessions and events that predate timing fields", () => {
    const current = createExamSession({
      attemptId: "attempt-legacy",
      paper: sampleExamPaper,
      mode: "mock",
      nowMs: 1_000,
      deadlineAtMs: 10_000,
    });
    const legacy = {
      ...current,
      eventQueue: [
        {
          id: "legacy-event",
          attemptId: "attempt-legacy",
          questionId: sampleExamPaper.questions[0].id,
          type: "answer_selected",
          selectedOptionId: "A",
          occurredAt: 1_500,
          clientSequence: 1,
        },
      ],
      nextClientSequence: 1,
    } as unknown as Record<string, unknown>;
    delete legacy.timeSpentByQuestionMs;
    delete legacy.questionEnteredAtMs;

    const normalizePersistedExamSession = (
      persistence as typeof persistence & {
        normalizePersistedExamSession: (value: unknown) => ReturnType<typeof createExamSession>;
      }
    ).normalizePersistedExamSession;
    const normalized = normalizePersistedExamSession(legacy);

    expect(normalized.eventQueue[0].timeSpentMs).toBe(0);
    expect(normalized.timeSpentByQuestionMs).toEqual({
      [sampleExamPaper.questions[0].id]: 0,
    });
    expect(normalized.questionEnteredAtMs).toBe(1_000);
    expect(normalized.nextClientSequence).toBe(2);
  });
});
