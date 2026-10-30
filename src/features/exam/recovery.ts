import type {
  ExamMode,
  ExamRecoveryIdentity,
  ExamSessionState,
} from "@/features/exam/session";
import { getRemainingTimeMs } from "@/features/exam/timer";

export type AttemptRecoveryIdentity = ExamRecoveryIdentity & {
  localAttemptId: string;
  generationStorageKey: string;
  idempotencyKey: string;
};

function recoveryScope({
  userId,
  paperVersionId,
  mode,
}: {
  userId: string;
  paperVersionId: string;
  mode: ExamMode;
}) {
  return [userId, paperVersionId, mode].map(encodeURIComponent).join(":");
}

export function buildAttemptGenerationStorageKey(input: {
  userId: string;
  paperVersionId: string;
  mode: ExamMode;
}) {
  return `medmock:attempt-generation:${recoveryScope(input)}`;
}

export function buildAttemptRecoveryIdentity(
  identity: ExamRecoveryIdentity,
): AttemptRecoveryIdentity {
  const scope = recoveryScope(identity);
  const generation = encodeURIComponent(identity.generation);

  return {
    ...identity,
    localAttemptId: `local:${scope}:${generation}`,
    generationStorageKey: buildAttemptGenerationStorageKey(identity),
    idempotencyKey: `${identity.userId}:${identity.generation}`,
  };
}

export function validateRecoverableSession(
  state: ExamSessionState,
  identity: AttemptRecoveryIdentity,
) {
  const savedIdentity = state.recoveryIdentity;
  if (
    state.paper.id !== identity.paperVersionId ||
    state.mode !== identity.mode ||
    !savedIdentity ||
    savedIdentity.userId !== identity.userId ||
    savedIdentity.paperVersionId !== identity.paperVersionId ||
    savedIdentity.mode !== identity.mode ||
    savedIdentity.generation !== identity.generation
  ) {
    throw new Error("Saved exam session does not match this attempt.");
  }

  return state;
}

export function rebindExamSessionAttempt(
  state: ExamSessionState,
  attemptId: string,
  deadlineAtMs: number,
  identity?: AttemptRecoveryIdentity,
): ExamSessionState {
  if (identity) validateRecoverableSession(state, identity);

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

export function createRetryingFinalizer({
  finalize,
  retryDelayMs,
  schedule,
  cancel,
}: {
  finalize: () => Promise<boolean>;
  retryDelayMs: number;
  schedule: typeof setTimeout;
  cancel: typeof clearTimeout;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  async function attempt() {
    if (stopped || running) return;
    running = true;
    const acknowledged = await finalize().catch(() => false);
    running = false;

    if (!acknowledged && !stopped) {
      timer = schedule(() => void attempt(), retryDelayMs);
    }
  }

  return {
    start() {
      stopped = false;
      void attempt();
    },
    stop() {
      stopped = true;
      if (timer !== undefined) cancel(timer);
      timer = undefined;
    },
  };
}
