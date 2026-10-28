import {
  type AnswerEventContract,
  type AppendAnswerEventsResponse,
  type CreateAttemptRequest,
  type CreateAttemptResponse,
  type SubmitAttemptResponse,
} from "@/features/exam/contracts";
import {
  AttemptSchema,
  type Attempt,
  type PaperVersion,
} from "@/features/exam/domain";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { scoreAttempt } from "@/features/exam/scoring";
import { materializeAnswers, mergeAnswerEvents } from "@/features/exam/session";

type AttemptRecord = {
  attempt: Attempt;
  paper: PaperVersion;
  requestFingerprint: string;
  createdResponse: CreateAttemptResponse;
  events: AnswerEventContract[];
  submittedResponse?: SubmitAttemptResponse;
};

type AttemptStoreState = {
  attempts: Map<string, AttemptRecord>;
  attemptIdByIdempotencyKey: Map<string, string>;
};

const globalAttemptState = globalThis as typeof globalThis & {
  medmockAttemptState?: AttemptStoreState;
};

const state = globalAttemptState.medmockAttemptState ?? {
  attempts: new Map<string, AttemptRecord>(),
  attemptIdByIdempotencyKey: new Map<string, string>(),
};

if (process.env.NODE_ENV !== "production") {
  globalAttemptState.medmockAttemptState = state;
}

const paperVersions = new Map<string, PaperVersion>([
  [sampleExamPaper.id, sampleExamPaper],
]);

function requestFingerprint(request: CreateAttemptRequest) {
  return JSON.stringify({
    paperVersionId: request.paperVersionId,
    mode: request.mode,
    strict: request.strict,
    visibility: request.visibility,
  });
}

function idempotencyLookupKey(userId: string, idempotencyKey: string) {
  return userId + ":" + idempotencyKey;
}

export function createAttemptRecord(
  request: CreateAttemptRequest,
  userId: string,
  nowMs: number,
):
  | { ok: true; replayed: boolean; response: CreateAttemptResponse }
  | { ok: false; error: "paper_not_found" | "idempotency_conflict" } {
  const paper = paperVersions.get(request.paperVersionId);

  if (!paper) {
    return { ok: false, error: "paper_not_found" };
  }

  const lookupKey = idempotencyLookupKey(userId, request.idempotencyKey);
  const fingerprint = requestFingerprint(request);
  const existingAttemptId = state.attemptIdByIdempotencyKey.get(lookupKey);

  if (existingAttemptId) {
    const existing = state.attempts.get(existingAttemptId);

    if (!existing || existing.requestFingerprint !== fingerprint) {
      return { ok: false, error: "idempotency_conflict" };
    }

    return { ok: true, replayed: true, response: existing.createdResponse };
  }

  const attemptId = crypto.randomUUID();
  const startedAt = new Date(nowMs).toISOString();
  const deadlineAt = new Date(
    nowMs + paper.durationMinutes * 60_000,
  ).toISOString();
  const attemptNumber =
    Array.from(state.attempts.values()).filter(
      (record) =>
        record.attempt.userId === userId &&
        record.attempt.paperVersionId === paper.id &&
        record.attempt.mode === request.mode &&
        record.attempt.strict === request.strict,
    ).length + 1;
  const attempt = AttemptSchema.parse({
    id: attemptId,
    userId,
    paperVersionId: paper.id,
    mode: request.mode,
    strict: request.strict,
    attemptNumber,
    visibility: request.visibility,
    integrityStatus: "clear",
    startedAt,
    deadlineAt,
    answers: [],
  });
  const createdResponse: CreateAttemptResponse = {
    attemptId,
    status: "active",
    startedAt,
    deadlineAt,
  };

  state.attempts.set(attemptId, {
    attempt,
    paper,
    requestFingerprint: fingerprint,
    createdResponse,
    events: [],
  });
  state.attemptIdByIdempotencyKey.set(lookupKey, attemptId);

  return { ok: true, replayed: false, response: createdResponse };
}

function sameEvent(left: AnswerEventContract, right: AnswerEventContract) {
  return (
    left.id === right.id &&
    left.attemptId === right.attemptId &&
    left.questionId === right.questionId &&
    left.type === right.type &&
    left.selectedOptionId === right.selectedOptionId &&
    left.occurredAt === right.occurredAt &&
    left.clientSequence === right.clientSequence
  );
}

function eventBelongsToPaper(
  event: AnswerEventContract,
  record: AttemptRecord,
) {
  const question = record.paper.questions.find(
    (candidate) => candidate.id === event.questionId,
  );

  if (!question) return false;
  if (event.type === "answer_cleared") return true;

  return question.options.some(
    (option) => option.id === event.selectedOptionId,
  );
}

export function appendAttemptEvents(
  attemptId: string,
  events: AnswerEventContract[],
):
  | { ok: true; response: AppendAnswerEventsResponse }
  | {
      ok: false;
      error:
        | "attempt_not_found"
        | "attempt_submitted"
        | "invalid_answer_event"
        | "answer_event_conflict";
      eventId?: string;
    } {
  const record = state.attempts.get(attemptId);

  if (!record) return { ok: false, error: "attempt_not_found" };
  if (record.submittedResponse) return { ok: false, error: "attempt_submitted" };

  const knownEvents = new Map(record.events.map((event) => [event.id, event]));
  const acceptedEvents: AnswerEventContract[] = [];
  const duplicateEventIds: string[] = [];

  for (const event of events) {
    if (event.attemptId !== attemptId || !eventBelongsToPaper(event, record)) {
      return { ok: false, error: "invalid_answer_event", eventId: event.id };
    }

    const existing = knownEvents.get(event.id);

    if (existing) {
      if (!sameEvent(existing, event)) {
        return { ok: false, error: "answer_event_conflict", eventId: event.id };
      }

      duplicateEventIds.push(event.id);
      continue;
    }

    knownEvents.set(event.id, event);
    acceptedEvents.push(event);
  }

  record.events = mergeAnswerEvents(record.events, acceptedEvents);

  return {
    ok: true,
    response: {
      acceptedEventIds: acceptedEvents.map((event) => event.id),
      duplicateEventIds,
      eventCount: record.events.length,
    },
  };
}

function buildAttemptAnswers(record: AttemptRecord) {
  const materialized = materializeAnswers(record.events);

  return record.paper.questions.flatMap((question) => {
    const answer = materialized[question.id];

    return answer
      ? [
          {
            questionId: question.id,
            selectedOptionId: answer.selectedOptionId,
            answeredAt: new Date(answer.answeredAt).toISOString(),
            timeSpentMs: 0,
          },
        ]
      : [];
  });
}

export function submitAttemptRecord(
  attemptId: string,
  nowMs: number,
):
  | { ok: true; response: SubmitAttemptResponse }
  | { ok: false; error: "attempt_not_found" } {
  const record = state.attempts.get(attemptId);

  if (!record) return { ok: false, error: "attempt_not_found" };
  if (record.submittedResponse) {
    return { ok: true, response: record.submittedResponse };
  }

  const submittedAt = new Date(nowMs).toISOString();
  const deadlineAtMs = record.attempt.deadlineAt
    ? Date.parse(record.attempt.deadlineAt)
    : Number.POSITIVE_INFINITY;
  const submissionReason = nowMs >= deadlineAtMs ? "expired" : "manual";
  const finalizedAttempt = AttemptSchema.parse({
    ...record.attempt,
    submittedAt,
    answers: buildAttemptAnswers(record),
  });
  const result = scoreAttempt(record.paper, finalizedAttempt);
  const response: SubmitAttemptResponse = {
    attemptId,
    status: "submitted",
    submissionReason,
    submittedAt,
    result,
  };

  record.attempt = finalizedAttempt;
  record.submittedResponse = response;

  return { ok: true, response };
}
