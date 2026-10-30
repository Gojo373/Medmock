import {
  AppendAnswerEventsResponseSchema,
  CreateAttemptResponseSchema,
  SubmitAttemptResponseSchema,
  type AnswerEventContract,
  type AppendAnswerEventsResponse,
  type CreateAttemptRequest,
  type CreateAttemptResponse,
  type SubmitAttemptResponse,
} from "@/features/exam/contracts";
import {
  AttemptSchema,
  PaperVersionSchema,
  type Attempt,
  type PaperVersion,
} from "@/features/exam/domain";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { scoreAttempt } from "@/features/exam/scoring";
import { materializeAnswers, mergeAnswerEvents } from "@/features/exam/session";
import {
  createSupabaseAdminClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";
import {
  normalizeDatabaseTimestamp,
  normalizeNullableDatabaseTimestamp,
} from "@/lib/database-timestamps";

type CreateAttemptResult =
  | { ok: true; replayed: boolean; response: CreateAttemptResponse }
  | { ok: false; error: "paper_not_found" | "idempotency_conflict" };

type AppendAttemptEventsResult =
  | { ok: true; response: AppendAnswerEventsResponse }
  | {
      ok: false;
      error:
        | "attempt_not_found"
        | "attempt_submitted"
        | "invalid_answer_event"
        | "answer_event_conflict"
        | "event_after_deadline"
        | "practice_answer_locked";
      eventId?: string;
    };

type SubmitAttemptResult =
  | { ok: true; response: SubmitAttemptResponse }
  | { ok: false; error: "attempt_not_found" };

type AppendAttemptError = Extract<
  AppendAttemptEventsResult,
  { ok: false }
>["error"];

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
const offlineReceiptGraceMs = 30_000;

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

function createMemoryAttemptRecord(
  request: CreateAttemptRequest,
  userId: string,
  nowMs: number,
): CreateAttemptResult {
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

    return {
      ok: true,
      replayed: true,
      response: {
        ...existing.createdResponse,
        serverNow: new Date(nowMs).toISOString(),
      },
    };
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
    serverNow: new Date(nowMs).toISOString(),
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
    left.clientSequence === right.clientSequence &&
    left.timeSpentMs === right.timeSpentMs
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
  if (event.type !== "answer_selected") return true;

  return question.options.some(
    (option) => option.id === event.selectedOptionId,
  );
}

function appendMemoryAttemptEvents(
  attemptId: string,
  userId: string,
  events: AnswerEventContract[],
  receiptTimeMs: number,
): AppendAttemptEventsResult {
  const record = state.attempts.get(attemptId);

  if (!record || record.attempt.userId !== userId) {
    return { ok: false, error: "attempt_not_found" };
  }
  if (record.submittedResponse) return { ok: false, error: "attempt_submitted" };

  const knownEvents = new Map(record.events.map((event) => [event.id, event]));
  const lockedPracticeQuestions = new Set(
    record.attempt.mode === "practice"
      ? record.events
          .filter((event) => event.type === "answer_selected")
          .map((event) => event.questionId)
      : [],
  );
  const acceptedEvents: AnswerEventContract[] = [];
  const duplicateEventIds: string[] = [];
  const deadlineAtMs = Date.parse(record.attempt.deadlineAt!);

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

    if (
      event.occurredAt > deadlineAtMs ||
      receiptTimeMs > deadlineAtMs + offlineReceiptGraceMs
    ) {
      return { ok: false, error: "event_after_deadline", eventId: event.id };
    }

    if (
      record.attempt.mode === "practice" &&
      event.type === "answer_selected" &&
      lockedPracticeQuestions.has(event.questionId)
    ) {
      return { ok: false, error: "practice_answer_locked", eventId: event.id };
    }

    if (receiptTimeMs > deadlineAtMs) {
      record.attempt = AttemptSchema.parse({
        ...record.attempt,
        integrityStatus: "flagged",
      });
    }

    knownEvents.set(event.id, event);
    acceptedEvents.push(event);
    if (record.attempt.mode === "practice" && event.type === "answer_selected") {
      lockedPracticeQuestions.add(event.questionId);
    }
  }

  record.events = mergeAnswerEvents(record.events, acceptedEvents);

  return {
    ok: true,
    response: {
      acceptedEventIds: acceptedEvents.map((event) => event.id),
      duplicateEventIds,
      eventCount: record.events.length,
      ...(record.attempt.integrityStatus === "flagged"
        ? { integrityStatus: "flagged" as const }
        : {}),
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
            timeSpentMs: answer.timeSpentMs,
          },
        ]
      : [];
  });
}

function submitMemoryAttemptRecord(
  attemptId: string,
  userId: string,
  nowMs: number,
): SubmitAttemptResult {
  const record = state.attempts.get(attemptId);

  if (!record || record.attempt.userId !== userId) {
    return { ok: false, error: "attempt_not_found" };
  }
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

function shouldUsePersistentStore() {
  if (process.env.NODE_ENV === "test") return false;
  if (!hasSupabaseServerConfig()) {
    throw new Error("Supabase persistence is not configured.");
  }

  return true;
}

export function normalizeAttemptDatabaseRow<T extends Record<string, unknown>>(
  row: T,
): T & {
  started_at: string;
  deadline_at: string;
  submitted_at: string | undefined;
} {
  return {
    ...row,
    started_at: normalizeDatabaseTimestamp(row.started_at),
    deadline_at: normalizeDatabaseTimestamp(row.deadline_at),
    submitted_at: normalizeNullableDatabaseTimestamp(row.submitted_at),
  } as T & {
    started_at: string;
    deadline_at: string;
    submitted_at: string | undefined;
  };
}

function responseFromAttemptRow(row: Record<string, unknown>, nowMs: number) {
  const normalized = normalizeAttemptDatabaseRow(row);

  return CreateAttemptResponseSchema.parse({
    attemptId: normalized.id,
    status: "active",
    startedAt: normalized.started_at,
    deadlineAt: normalized.deadline_at,
    serverNow: new Date(nowMs).toISOString(),
  });
}

async function createPersistentAttemptRecord(
  request: CreateAttemptRequest,
  userId: string,
  nowMs: number,
  allocationRetry = 0,
): Promise<CreateAttemptResult> {
  const client = createSupabaseAdminClient();
  const { data: paperRow, error: paperError } = await client
    .from("paper_versions")
    .select("id, content")
    .eq("id", request.paperVersionId)
    .eq("status", "published")
    .maybeSingle();

  if (paperError) throw paperError;
  if (!paperRow) return { ok: false, error: "paper_not_found" };

  const paper = PaperVersionSchema.parse(paperRow.content);
  const fingerprint = requestFingerprint(request);
  const { data: existing, error: existingError } = await client
    .from("attempts")
    .select("id, started_at, deadline_at, request_fingerprint")
    .eq("user_id", userId)
    .eq("creation_idempotency_key", request.idempotencyKey)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    if (existing.request_fingerprint !== fingerprint) {
      return { ok: false, error: "idempotency_conflict" };
    }

    return {
      ok: true,
      replayed: true,
      response: responseFromAttemptRow(existing, nowMs),
    };
  }

  const { count, error: countError } = await client
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("paper_version_id", paper.id)
    .eq("mode", request.mode)
    .eq("strict", request.strict);

  if (countError) throw countError;

  const attemptId = crypto.randomUUID();
  const startedAt = new Date(nowMs).toISOString();
  const deadlineAt = new Date(
    nowMs + paper.durationMinutes * 60_000,
  ).toISOString();
  const row = {
    id: attemptId,
    user_id: userId,
    paper_version_id: paper.id,
    mode: request.mode,
    strict: request.strict,
    attempt_number: (count ?? 0) + 1,
    visibility: request.visibility,
    integrity_status: "clear",
    started_at: startedAt,
    deadline_at: deadlineAt,
    request_fingerprint: fingerprint,
    creation_idempotency_key: request.idempotencyKey,
  };
  const { error: insertError } = await client.from("attempts").insert(row);

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: replay } = await client
        .from("attempts")
        .select("id, started_at, deadline_at, request_fingerprint")
        .eq("user_id", userId)
        .eq("creation_idempotency_key", request.idempotencyKey)
        .maybeSingle();

      if (replay?.request_fingerprint === fingerprint) {
        return {
          ok: true,
          replayed: true,
          response: responseFromAttemptRow(replay, nowMs),
        };
      }

      if (!replay && allocationRetry < 3) {
        return createPersistentAttemptRecord(
          request,
          userId,
          nowMs,
          allocationRetry + 1,
        );
      }

      return { ok: false, error: "idempotency_conflict" };
    }

    throw insertError;
  }

  return {
    ok: true,
    replayed: false,
    response: CreateAttemptResponseSchema.parse({
      attemptId,
      status: "active",
      startedAt,
      deadlineAt,
      serverNow: new Date(nowMs).toISOString(),
    }),
  };
}

function eventFromRow(row: Record<string, unknown>): AnswerEventContract {
  return {
    id: row.id as string,
    attemptId: row.attempt_id as string,
    questionId: row.question_id as string,
    type: row.event_type as AnswerEventContract["type"],
    ...((row.selected_option_id as string | null)
      ? { selectedOptionId: row.selected_option_id as string }
      : {}),
    occurredAt: Number(row.occurred_at_ms),
    clientSequence: Number(row.client_sequence),
    timeSpentMs: Number(row.time_spent_ms ?? 0),
  };
}

async function loadPersistentAttempt(
  client: ReturnType<typeof createSupabaseAdminClient>,
  attemptId: string,
  userId: string,
) {
  const { data: attemptRow, error: attemptError } = await client
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();

  if (attemptError) throw attemptError;
  if (!attemptRow) return undefined;

  const { data: paperRow, error: paperError } = await client
    .from("paper_versions")
    .select("content")
    .eq("id", attemptRow.paper_version_id)
    .single();

  if (paperError) throw paperError;

  return {
    client,
    attemptRow: normalizeAttemptDatabaseRow(attemptRow),
    paper: PaperVersionSchema.parse(paperRow.content),
  };
}

export async function appendPersistentAttemptEventsWithClient(
  client: ReturnType<typeof createSupabaseAdminClient>,
  attemptId: string,
  userId: string,
  events: AnswerEventContract[],
): Promise<AppendAttemptEventsResult> {
  const loaded = await loadPersistentAttempt(client, attemptId, userId);

  if (!loaded) return { ok: false, error: "attempt_not_found" };
  if (loaded.attemptRow.submitted_at) {
    return { ok: false, error: "attempt_submitted" };
  }

  const record = {
    attempt: { userId },
    paper: loaded.paper,
  } as AttemptRecord;

  for (const event of events) {
    if (event.attemptId !== attemptId || !eventBelongsToPaper(event, record)) {
      return { ok: false, error: "invalid_answer_event", eventId: event.id };
    }
  }

  const { data, error } = await loaded.client.rpc("append_attempt_events", {
    p_attempt_id: attemptId,
    p_user_id: userId,
    p_events: events,
  });

  if (error) throw error;
  const result = data as Record<string, unknown>;
  if (result.error) {
    return {
      ok: false,
      error: result.error as AppendAttemptError,
      ...(result.eventId ? { eventId: String(result.eventId) } : {}),
    };
  }

  return { ok: true, response: AppendAnswerEventsResponseSchema.parse(result) };
}

async function appendPersistentAttemptEvents(
  attemptId: string,
  userId: string,
  events: AnswerEventContract[],
) {
  return appendPersistentAttemptEventsWithClient(
    createSupabaseAdminClient(),
    attemptId,
    userId,
    events,
  );
}

async function loadAllPersistentEvents(
  client: ReturnType<typeof createSupabaseAdminClient>,
  attemptId: string,
) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1_000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("answer_events")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("client_sequence", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }

  return rows.map(eventFromRow);
}

export async function submitPersistentAttemptRecordWithClient(
  client: ReturnType<typeof createSupabaseAdminClient>,
  attemptId: string,
  userId: string,
  nowMs: number,
): Promise<SubmitAttemptResult> {
  const loaded = await loadPersistentAttempt(client, attemptId, userId);

  if (!loaded) return { ok: false, error: "attempt_not_found" };
  if (loaded.attemptRow.submitted_response) {
    return {
      ok: true,
      response: SubmitAttemptResponseSchema.parse(
        loaded.attemptRow.submitted_response,
      ),
    };
  }

  const events = await loadAllPersistentEvents(loaded.client, attemptId);
  const materialized = materializeAnswers(events);
  const submittedAt = new Date(nowMs).toISOString();
  const submissionReason =
    nowMs >= Date.parse(loaded.attemptRow.deadline_at) ? "expired" : "manual";
  const attempt = AttemptSchema.parse({
    id: attemptId,
    userId,
    paperVersionId: loaded.paper.id,
    mode: loaded.attemptRow.mode,
    strict: loaded.attemptRow.strict,
    attemptNumber: loaded.attemptRow.attempt_number,
    visibility: loaded.attemptRow.visibility,
    integrityStatus: loaded.attemptRow.integrity_status,
    startedAt: loaded.attemptRow.started_at,
    deadlineAt: loaded.attemptRow.deadline_at,
    submittedAt,
    answers: loaded.paper.questions.flatMap((question) => {
      const answer = materialized[question.id];
      return answer
        ? [{
            questionId: question.id,
            selectedOptionId: answer.selectedOptionId,
            answeredAt: new Date(answer.answeredAt).toISOString(),
            timeSpentMs: answer.timeSpentMs,
          }]
        : [];
    }),
  });
  const result = scoreAttempt(loaded.paper, attempt);
  const response = SubmitAttemptResponseSchema.parse({
    attemptId,
    status: "submitted",
    submissionReason,
    submittedAt,
    result,
  });
  const { data: finalized, error: finalizeError } = await loaded.client.rpc(
    "finalize_attempt",
    {
      p_attempt_id: attemptId,
      p_user_id: userId,
      p_expected_event_count: events.length,
      p_submitted_at: submittedAt,
      p_submission_reason: submissionReason,
      p_response: response,
      p_result: result,
      p_score: result.score,
      p_max_score: result.maxScore,
      p_correct: result.correct,
      p_incorrect: result.incorrect,
    },
  );

  if (finalizeError) throw finalizeError;
  const finalizedResult = finalized as Record<string, unknown>;
  if (finalizedResult.error === "event_count_changed") {
    return submitPersistentAttemptRecordWithClient(
      client,
      attemptId,
      userId,
      nowMs,
    );
  }
  if (finalizedResult.error === "attempt_not_found") {
    return { ok: false, error: "attempt_not_found" };
  }

  return {
    ok: true,
    response: SubmitAttemptResponseSchema.parse(finalizedResult.response),
  };
}

async function submitPersistentAttemptRecord(
  attemptId: string,
  userId: string,
  nowMs: number,
) {
  return submitPersistentAttemptRecordWithClient(
    createSupabaseAdminClient(),
    attemptId,
    userId,
    nowMs,
  );
}

export async function createAttemptRecord(
  request: CreateAttemptRequest,
  userId: string,
  nowMs: number,
): Promise<CreateAttemptResult> {
  return shouldUsePersistentStore()
    ? createPersistentAttemptRecord(request, userId, nowMs)
    : createMemoryAttemptRecord(request, userId, nowMs);
}

export async function appendAttemptEvents(
  attemptId: string,
  userId: string,
  events: AnswerEventContract[],
  receiptTimeMs: number,
): Promise<AppendAttemptEventsResult> {
  return shouldUsePersistentStore()
    ? appendPersistentAttemptEvents(attemptId, userId, events)
    : appendMemoryAttemptEvents(attemptId, userId, events, receiptTimeMs);
}

export async function submitAttemptRecord(
  attemptId: string,
  userId: string,
  nowMs: number,
): Promise<SubmitAttemptResult> {
  return shouldUsePersistentStore()
    ? submitPersistentAttemptRecord(attemptId, userId, nowMs)
    : submitMemoryAttemptRecord(attemptId, userId, nowMs);
}
