import { describe, expect, it, vi } from "vitest";

import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import * as attemptStore from "@/features/exam/server/attempt-store";

const attemptId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function productionClient(withUnansweredTimes = false) {
  const attemptRow = {
    id: attemptId,
    user_id: userId,
    paper_version_id: sampleExamPaper.id,
    mode: "mock",
    strict: true,
    attempt_number: 1,
    visibility: "public",
    integrity_status: "clear",
    started_at: "2026-10-28T10:00:00+00:00",
    deadline_at: "2026-10-28T13:00:00+00:00",
    submitted_at: null,
    submitted_response: null,
  };
  const eventRow = {
    attempt_id: attemptId,
    id: "event-1",
    question_id: "physics-1",
    event_type: "answer_selected",
    selected_option_id: "B",
    occurred_at_ms: Date.parse("2026-10-28T10:00:01.000Z"),
    client_sequence: 1,
    time_spent_ms: 1_000,
  };
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: table === "attempts" ? attemptRow : null,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: table === "paper_versions" ? { content: sampleExamPaper } : null,
        error: null,
      })),
      range: vi.fn(async () => ({
        data: table === "answer_events" ? [
          eventRow,
          ...(withUnansweredTimes ? [
            { ...eventRow, id: "clear-1", event_type: "answer_cleared", selected_option_id: null, client_sequence: 2, time_spent_ms: 2_000 },
            { ...eventRow, id: "visit-2", question_id: "physics-2", event_type: "time_spent", selected_option_id: null, client_sequence: 3, time_spent_ms: 3_000 },
          ] : []),
        ] : [],
        error: null,
      })),
    };
    return query;
  });
  let finalizeCalls = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "append_attempt_events") {
      return {
        data: {
          acceptedEventIds: ["event-1"],
          duplicateEventIds: [],
          eventCount: 1,
          integrityStatus: "clear",
        },
        error: null,
      };
    }
    finalizeCalls += 1;
    return finalizeCalls === 1
      ? { data: { error: "event_count_changed" }, error: null }
      : { data: { response: args.p_response }, error: null };
  });
  return { client: { from, rpc }, rpc };
}

describe("persistent attempt production adapter", () => {
  it("finalizes cumulative timing for cleared and ultimately unanswered questions", async () => {
    const { client, rpc } = productionClient(true);
    await expect(attemptStore.submitPersistentAttemptRecordWithClient(client as never, attemptId, userId, Date.parse("2026-10-28T10:00:02Z")))
      .resolves.toMatchObject({ ok: true, response: { result: { score: 0, timeSpentByQuestionMs: { "physics-1": 2_000, "physics-2": 3_000 } } } });
    expect(rpc).toHaveBeenCalledWith("finalize_attempt", expect.objectContaining({ p_expected_event_count: 3, p_result: expect.objectContaining({ timeSpentByQuestionMs: { "physics-1": 2_000, "physics-2": 3_000 } }) }));
  });

  it("normalizes database rows, appends through the RPC, and retries concurrent finalization", async () => {
    const { client, rpc } = productionClient();
    const appendPersistentAttemptEventsWithClient = (
      attemptStore as typeof attemptStore & {
        appendPersistentAttemptEventsWithClient: (
          client: never,
          attemptId: string,
          userId: string,
          events: Array<Record<string, unknown>>,
        ) => Promise<{ ok: boolean }>;
        submitPersistentAttemptRecordWithClient: (
          client: never,
          attemptId: string,
          userId: string,
          nowMs: number,
        ) => Promise<{ ok: boolean; response?: { result: { score: number } } }>;
      }
    ).appendPersistentAttemptEventsWithClient;
    const submitPersistentAttemptRecordWithClient = (
      attemptStore as typeof attemptStore & {
        submitPersistentAttemptRecordWithClient: (
          client: never,
          attemptId: string,
          userId: string,
          nowMs: number,
        ) => Promise<{ ok: boolean; response?: { result: { score: number } } }>;
      }
    ).submitPersistentAttemptRecordWithClient;
    const event = {
      id: "event-1",
      attemptId,
      questionId: "physics-1",
      type: "answer_selected",
      selectedOptionId: "B",
      occurredAt: Date.parse("2026-10-28T10:00:01.000Z"),
      clientSequence: 1,
      timeSpentMs: 1_000,
    };

    await expect(
      appendPersistentAttemptEventsWithClient(client as never, attemptId, userId, [event]),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      submitPersistentAttemptRecordWithClient(
        client as never,
        attemptId,
        userId,
        Date.parse("2026-10-28T10:00:02.000Z"),
      ),
    ).resolves.toMatchObject({ ok: true, response: { result: { score: 4 } } });

    expect(rpc.mock.calls.filter(([name]) => name === "finalize_attempt")).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith(
      "append_attempt_events",
      expect.objectContaining({ p_attempt_id: attemptId, p_user_id: userId }),
    );
  });
});
