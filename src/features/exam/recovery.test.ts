import { describe, expect, it, vi } from "vitest";

import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { createExamSession, examSessionReducer } from "@/features/exam/session";
import * as recovery from "@/features/exam/recovery";

describe("exam connection recovery", () => {
  it("recognizes generated local IDs and connects before submission after initial failure", async () => {
    const identity = recovery.buildAttemptRecoveryIdentity({ userId: "student", paperVersionId: sampleExamPaper.id, mode: "mock", generation: "retry" });
    let attemptId = identity.localAttemptId;
    expect(recovery.isLocalAttemptId(attemptId)).toBe(true);
    const connect = vi.fn().mockResolvedValueOnce(false).mockImplementationOnce(async () => { attemptId = "8cbb9106-cf41-4f63-8bd6-11c38bb7033a"; return true; });
    await expect(recovery.ensureServerAttempt({ getAttemptId: () => attemptId, connect })).resolves.toBe(false);
    await expect(recovery.ensureServerAttempt({ getAttemptId: () => attemptId, connect })).resolves.toBe(true);
    expect(recovery.isLocalAttemptId(attemptId)).toBe(false);
    expect(connect).toHaveBeenCalledTimes(2);
  });
  it("namespaces recovery by user, version, mode, and generation and rejects mismatched snapshots", () => {
    const buildAttemptRecoveryIdentity = (
      recovery as typeof recovery & {
        buildAttemptRecoveryIdentity: (input: {
          userId: string;
          paperVersionId: string;
          mode: "mock" | "practice";
          generation: string;
        }) => {
          localAttemptId: string;
          generationStorageKey: string;
          idempotencyKey: string;
          userId: string;
          paperVersionId: string;
          mode: "mock" | "practice";
          generation: string;
        };
      }
    ).buildAttemptRecoveryIdentity;
    const validateRecoverableSession = (
      recovery as typeof recovery & {
        validateRecoverableSession: (
          state: ReturnType<typeof createExamSession>,
          identity: ReturnType<typeof buildAttemptRecoveryIdentity>,
        ) => ReturnType<typeof createExamSession>;
      }
    ).validateRecoverableSession;
    const mockIdentity = buildAttemptRecoveryIdentity({
      userId: "student-a",
      paperVersionId: sampleExamPaper.id,
      mode: "mock",
      generation: "generation-1",
    });
    const nextIdentity = buildAttemptRecoveryIdentity({
      userId: "student-a",
      paperVersionId: sampleExamPaper.id,
      mode: "mock",
      generation: "generation-2",
    });
    const otherUserIdentity = buildAttemptRecoveryIdentity({
      userId: "student-b",
      paperVersionId: sampleExamPaper.id,
      mode: "mock",
      generation: "generation-1",
    });
    const practice = createExamSession({
      attemptId: mockIdentity.localAttemptId,
      paper: sampleExamPaper,
      mode: "practice",
      nowMs: 1_000,
      deadlineAtMs: 10_000,
      recoveryIdentity: mockIdentity,
    });

    expect(mockIdentity.localAttemptId).not.toBe(nextIdentity.localAttemptId);
    expect(mockIdentity.localAttemptId).not.toBe(otherUserIdentity.localAttemptId);
    expect(mockIdentity.idempotencyKey).toContain("student-a");
    expect(() => validateRecoverableSession(practice, mockIdentity)).toThrow(
      "Saved exam session does not match this attempt.",
    );
  });

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

  it("keeps retrying expiry finalization until the server acknowledges it", async () => {
    vi.useFakeTimers();
    const finalize = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const createRetryingFinalizer = (
      recovery as typeof recovery & {
        createRetryingFinalizer: (input: {
          finalize: () => Promise<boolean>;
          retryDelayMs: number;
          schedule: typeof setTimeout;
          cancel: typeof clearTimeout;
        }) => { start(): void; stop(): void };
      }
    ).createRetryingFinalizer;
    const controller = createRetryingFinalizer({
      finalize,
      retryDelayMs: 2_000,
      schedule: setTimeout,
      cancel: clearTimeout,
    });

    controller.start();
    await vi.advanceTimersByTimeAsync(4_000);

    expect(finalize).toHaveBeenCalledTimes(3);
    controller.stop();
    vi.useRealTimers();
  });
});
