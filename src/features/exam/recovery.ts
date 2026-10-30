import type { ExamSessionState } from "@/features/exam/session";
import { getRemainingTimeMs } from "@/features/exam/timer";

export function rebindExamSessionAttempt(
  state: ExamSessionState,
  attemptId: string,
  deadlineAtMs: number,
): ExamSessionState {
  return {
    ...state,
    attemptId,
    deadlineAtMs,
    remainingMs: getRemainingTimeMs(deadlineAtMs, state.nowMs),
    eventQueue: state.eventQueue.map((event) => ({ ...event, attemptId })),
  };
}

export function createOnlineAttemptRecovery({
  connect,
  onDisconnected,
  subscribeOnline,
}: {
  connect: () => Promise<void>;
  onDisconnected: () => void;
  subscribeOnline: (listener: () => void) => () => void;
}) {
  let connected = false;
  let running: Promise<boolean> | undefined;
  let unsubscribe: (() => void) | undefined;

  function retry() {
    if (connected) return Promise.resolve(true);
    if (running) return running;

    running = connect()
      .then(() => {
        connected = true;
        unsubscribe?.();
        unsubscribe = undefined;
        return true;
      })
      .catch(() => {
        onDisconnected();
        return false;
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  }

  return {
    start() {
      unsubscribe ??= subscribeOnline(() => {
        void retry();
      });
      return retry();
    },
    retry,
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}
