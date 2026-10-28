import {
  mergeAnswerEvents,
  type AnswerEvent,
  type ExamSessionState,
} from "@/features/exam/session";

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
    return result;
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

  async getQueuedEvents(attemptId: string) {
    const database = await this.database;
    const transaction = database.transaction(eventStoreName, "readonly");
    const index = transaction.objectStore(eventStoreName).index("attemptId");
    const events = await requestResult<AnswerEvent[]>(index.getAll(attemptId));
    await transactionDone(transaction);
    return mergeAnswerEvents([], events);
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
