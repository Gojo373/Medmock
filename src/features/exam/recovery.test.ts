import { describe, expect, it, vi } from "vitest";

import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { createExamSession, examSessionReducer } from "@/features/exam/session";
import * as recovery from "@/features/exam/recovery";

describe("exam connection recovery", () => {
  it("rebinds a local session and all queued events to the server attempt", () => {
    let local = createExamSession({
      attemptId: "local-paper",
      paper: sampleExamPaper,
      mode: "mock",
      nowMs: 1_000,
      deadlineAtMs: 10_000,
    });
    local = examSessionReducer(local, {
      type: "SELECT_OPTION",
      eventId: "event-1",
      questionId: sampleExamPaper.questions[0].id,
      optionId: sampleExamPaper.questions[0].options[0].id,
      occurredAt: 1_500,
    });
    const rebindExamSessionAttempt = (
      recovery as typeof recovery & {
        rebindExamSessionAttempt: typeof import("@/features/exam/recovery")["rebindExamSessionAttempt"];
      }
    ).rebindExamSessionAttempt;

    const rebound = rebindExamSessionAttempt(local, "server-attempt", 20_000);

    expect(rebound.attemptId).toBe("server-attempt");
    expect(rebound.deadlineAtMs).toBe(20_000);
    expect(rebound.eventQueue).toEqual([
      expect.objectContaining({ id: "event-1", attemptId: "server-attempt" }),
    ]);
    expect(rebound.answers).toEqual(local.answers);
  });

  it("retries a failed attempt connection when connectivity returns", async () => {
    let onlineListener: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const connect = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(undefined);
    const onDisconnected = vi.fn();
    const createOnlineAttemptRecovery = (
      recovery as typeof recovery & {
        createOnlineAttemptRecovery: typeof import("@/features/exam/recovery")["createOnlineAttemptRecovery"];
      }
    ).createOnlineAttemptRecovery;
    const controller = createOnlineAttemptRecovery({
      connect,
      onDisconnected,
      subscribeOnline(listener) {
        onlineListener = listener;
        return unsubscribe;
      },
    });

    await expect(controller.start()).resolves.toBe(false);
    expect(onDisconnected).toHaveBeenCalledTimes(1);

    onlineListener?.();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });
});
