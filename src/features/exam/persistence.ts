import {
  mergeAnswerEvents,
  type AnswerEvent,
  type ExamSessionState,
} from "@/features/exam/session";
import { AttemptSyncError, type EventSyncOutcome } from "@/features/exam/client-attempt";

type EventSyncResponse = {
  acceptedEventIds: string[];
  duplicateEventIds: string[];
};

function normalizePersistedAnswerEvent(value: AnswerEvent): AnswerEvent {
  return {
    ...value,
    occurredAt: Math.round(value.occurredAt),
    timeSpentMs:
      Number.isFinite(value.timeSpentMs) && value.timeSpentMs >= 0
        ? Math.round(value.timeSpentMs)
        : 0,
  };
}

export function normalizePersistedExamSession(value: unknown): ExamSessionState {
  if (!value || typeof value !== "object") {
    throw new Error("Saved exam session is invalid.");
  }

  const state = value as ExamSessionState;
  const eventQueue = Array.isArray(state.eventQueue)
    ? state.eventQueue.map(normalizePersistedAnswerEvent)
    : [];
  const timeSpentByQuestionMs = Object.fromEntries(Object.entries(state.timeSpentByQuestionMs ?? {})
    .map(([id, milliseconds]) => [id, Number.isFinite(milliseconds) ? Math.max(0, Math.round(milliseconds)) : 0]));

  for (const event of eventQueue) {
    timeSpentByQuestionMs[event.questionId] = Math.max(
      timeSpentByQuestionMs[event.questionId] ?? 0,
      event.timeSpentMs,
    );
  }

  const nowMs = Number.isFinite(state.nowMs) ? state.nowMs : Date.now();
  return {
    ...state,
    eventQueue,
    timeSpentByQuestionMs,
    questionEnteredAtMs: Number.isFinite(state.questionEnteredAtMs)
      ? Math.round(state.questionEnteredAtMs)
      : nowMs,
    nextClientSequence: Math.max(
      Number.isFinite(state.nextClientSequence) ? state.nextClientSequence : 1,
      1,
      ...eventQueue.map((event) => event.clientSequence + 1),
    ),
  };
}

export function createAttemptEventSyncController({
  getEvents,
  sendEvents,
  acknowledge,
  reject,
}: {
  getEvents: () => AnswerEvent[];
  sendEvents: (events: AnswerEvent[]) => Promise<EventSyncResponse>;
  acknowledge: (eventIds: string[]) => Promise<void>;
  reject?: (events: AnswerEvent[]) => Promise<void>;
}) {
  let requested = false;
  let running: Promise<EventSyncOutcome> | undefined;
  let terminal: EventSyncOutcome | undefined;
  const rejectedEventIds = new Set<string>();

  async function drain(): Promise<EventSyncOutcome> {
    while (requested) {
      requested = false;
      const events = mergeAnswerEvents([], getEvents()).slice(0, 500);
      if (events.length === 0) continue;

      try {
        const result = await sendEvents(events);
        const acknowledged = [...result.acceptedEventIds, ...result.duplicateEventIds];
        if (!events.some((event) => acknowledged.includes(event.id))) throw new Error("Sync made no progress");
        await acknowledge(acknowledged);
      } catch (error) {
        if (!(error instanceof AttemptSyncError)) throw error;
        if (error.code === "attempt_submitted") {
          return terminal = { status: "submitted" };
        }
        const rejected = events.find((event) => event.id === error.eventId);
        if (error.code === "event_after_deadline" && rejected && reject) {
          await reject([rejected]);
          rejectedEventIds.add(rejected.id);
          if (getEvents().some((event) => event.id === rejected.id)) throw new Error("Rejected event was not retained separately");
        } else {
          return terminal = { status: "blocked", code: error.code };
        }
      }

      if (getEvents().length > 0) requested = true;
    }
    return rejectedEventIds.size > 0
      ? { status: "rejected", rejectedEventIds: [...rejectedEventIds] }
      : { status: "drained" };
  }

  return {
    request() {
      if (terminal) return Promise.resolve(terminal);
      requested = true;
      if (!running) {
        running = drain().finally(() => {
          running = undefined;
        });
      }
      return running;
    },
  };
}

const defaultDatabaseName = "medmock-attempts";
const databaseVersion = 1;
const sessionStoreName = "sessions";
const eventStoreName = "events";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

export class IndexedDbAttemptPersistence {
  private readonly database: Promise<IDBDatabase>;

  constructor(databaseName = defaultDatabaseName) {
    if (typeof indexedDB === "undefined") {
      throw new Error("IndexedDB is not available in this environment.");
    }

    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(sessionStoreName)) {
          database.createObjectStore(sessionStoreName, { keyPath: "attemptId" });
        }

        if (!database.objectStoreNames.contains(eventStoreName)) {
          const events = database.createObjectStore(eventStoreName, { keyPath: "id" });
          events.createIndex("attemptId", "attemptId", { unique: false });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  async saveSession(session: ExamSessionState) {
    const database = await this.database;
    const transaction = database.transaction(sessionStoreName, "readwrite");
    transaction.objectStore(sessionStoreName).put(session);
    await transactionDone(transaction);
  }

  async loadSession(attemptId: string) {
    const database = await this.database;
    const transaction = database.transaction(sessionStoreName, "readonly");
    const result = await requestResult<ExamSessionState | undefined>(
      transaction.objectStore(sessionStoreName).get(attemptId),
    );
    await transactionDone(transaction);
    return result ? normalizePersistedExamSession(result) : undefined;
  }

  async queueEvents(events: AnswerEvent[]) {
    if (events.length === 0) return;

    const database = await this.database;
    const transaction = database.transaction(eventStoreName, "readwrite");
    const store = transaction.objectStore(eventStoreName);

    for (const event of events) {
      store.put(event);
    }

    await transactionDone(transaction);
  }

  async migrateSessionAttempt(
    previousAttemptId: string,
    session: ExamSessionState,
  ) {
    const database = await this.database;
    const transaction = database.transaction(
      [sessionStoreName, eventStoreName],
      "readwrite",
    );
    const sessions = transaction.objectStore(sessionStoreName);
    const events = transaction.objectStore(eventStoreName);
    const previousEventKeys = events
      .index("attemptId")
      .getAllKeys(previousAttemptId);

    sessions.put(session);
    if (previousAttemptId !== session.attemptId) sessions.delete(previousAttemptId);
    previousEventKeys.addEventListener("success", () => {
      for (const key of previousEventKeys.result) events.delete(key);
    });
    for (const event of session.eventQueue) events.put(event);

    await transactionDone(transaction);
  }

  async retireAttempt(attemptId: string) {
    const database = await this.database;
    const transaction = database.transaction(
      [sessionStoreName, eventStoreName],
      "readwrite",
    );
    transaction.objectStore(sessionStoreName).delete(attemptId);
    const events = transaction.objectStore(eventStoreName);
    const eventKeys = events.index("attemptId").getAllKeys(attemptId);
    eventKeys.addEventListener("success", () => {
      for (const key of eventKeys.result) events.delete(key);
    });
    await transactionDone(transaction);
  }

  async getQueuedEvents(attemptId: string) {
    const database = await this.database;
    const transaction = database.transaction(eventStoreName, "readonly");
    const index = transaction.objectStore(eventStoreName).index("attemptId");
    const events = await requestResult<AnswerEvent[]>(index.getAll(attemptId));
    await transactionDone(transaction);
    return mergeAnswerEvents([], events.map(normalizePersistedAnswerEvent));
  }

  async markEventsSynced(eventIds: string[]) {
    if (eventIds.length === 0) return;

    const database = await this.database;
    const transaction = database.transaction(eventStoreName, "readwrite");
    const store = transaction.objectStore(eventStoreName);

    for (const eventId of eventIds) {
      store.delete(eventId);
    }

    await transactionDone(transaction);
  }
}
