import {
  mergeAnswerEvents,
  type AnswerEvent,
  type ExamSessionState,
} from "@/features/exam/session";

type EventSyncResponse = {
  acceptedEventIds: string[];
  duplicateEventIds: string[];
};

function normalizePersistedAnswerEvent(value: AnswerEvent): AnswerEvent {
  return {
    ...value,
    timeSpentMs:
      Number.isFinite(value.timeSpentMs) && value.timeSpentMs >= 0
        ? value.timeSpentMs
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
  const timeSpentByQuestionMs = {
    ...(state.timeSpentByQuestionMs ?? {}),
  };

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
      ? state.questionEnteredAtMs
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
}: {
  getEvents: () => AnswerEvent[];
  sendEvents: (events: AnswerEvent[]) => Promise<EventSyncResponse>;
  acknowledge: (eventIds: string[]) => Promise<void>;
}) {
  let requested = false;
  let running: Promise<void> | undefined;

  async function drain() {
    while (requested) {
      requested = false;
      const events = mergeAnswerEvents([], getEvents()).slice(0, 500);
      if (events.length === 0) continue;

      const result = await sendEvents(events);
      await acknowledge([
        ...result.acceptedEventIds,
        ...result.duplicateEventIds,
      ]);

      if (getEvents().length > 0) requested = true;
    }
  }

  return {
    request() {
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
