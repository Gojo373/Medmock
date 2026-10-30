import { describe, expect, it } from "vitest";

import { PaperVersionSchema, type PaperVersion } from "@/features/exam/domain";
import {
  createExamSession,
  examSessionReducer,
  materializeAnswers,
  mergeAnswerEvents,
  type AnswerEvent,
} from "@/features/exam/session";

function localized(en: string, hi = en + " हिंदी") {
  return { en, hi };
}

function question(
  id: string,
  sectionId: string,
  subject: "physics" | "chemistry" | "biology",
  acceptedOptionId: string,
) {
  return {
    id,
    sectionId,
    subject,
    topic: "Foundations",
    stem: localized("Question " + id),
    options: ["A", "B", "C", "D"].map((optionId) => ({
      id: optionId,
      text: localized("Option " + optionId),
    })),
    acceptedOptionIds: [acceptedOptionId],
    solution: localized("Reviewed solution for " + id),
    disposition: "standard" as const,
    marking: { correct: 4, incorrect: -1, unattempted: 0 },
  };
}

function paper(): PaperVersion {
  return PaperVersionSchema.parse({
    schemaVersion: 1,
    id: "version-1",
    paperId: "paper-1",
    revision: 1,
    status: "published",
    title: localized("NEET practice paper"),
    durationMinutes: 180,
    publishedAt: "2026-10-28T10:00:00.000Z",
    sections: [
      {
        id: "physics",
        subject: "physics",
        title: localized("Physics"),
        questionIds: ["p1", "p2"],
        selectionLimit: 1,
      },
      {
        id: "chemistry",
        subject: "chemistry",
        title: localized("Chemistry"),
        questionIds: ["c1"],
      },
    ],
    questions: [
      question("p1", "physics", "physics", "A"),
      question("p2", "physics", "physics", "B"),
      question("c1", "chemistry", "chemistry", "C"),
    ],
  });
}

function session(mode: "mock" | "practice" = "mock") {
  return createExamSession({
    attemptId: "attempt-1",
    paper: paper(),
    mode,
    nowMs: 1_000,
    deadlineAtMs: 10_000,
  });
}

describe("examSessionReducer", () => {
  it("supports select, change, clear, navigate, and mark-for-review transitions", () => {
    let state = session();

    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "event-1",
      questionId: "p1",
      optionId: "A",
      occurredAt: 1_100,
    });
    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "event-2",
      questionId: "p1",
      optionId: "B",
      occurredAt: 1_200,
    });
    state = examSessionReducer(state, {
      type: "TOGGLE_REVIEW",
      questionId: "p1",
    });
    state = examSessionReducer(state, {
      type: "NAVIGATE",
      questionId: "c1",
      eventId: "time-p1",
      occurredAt: 1_250,
    });

    expect(state.answers.p1).toMatchObject({ selectedOptionId: "B", locked: false });
    expect(state.markedForReview).toContain("p1");
    expect(state.currentQuestionId).toBe("c1");

    state = examSessionReducer(state, {
      type: "CLEAR_RESPONSE",
      eventId: "event-3",
      questionId: "p1",
      occurredAt: 1_300,
    });

    expect(state.answers.p1).toBeUndefined();
    expect(state.eventQueue.map((event) => event.type)).toEqual([
      "answer_selected",
      "answer_selected",
      "time_spent",
      "answer_cleared",
    ]);
  });

  it("locks the first practice choice and reveals reviewed feedback immediately", () => {
    let state = session("practice");

    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "event-1",
      questionId: "p1",
      optionId: "B",
      occurredAt: 1_100,
    });
    const afterFirstChoice = state;
    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "event-2",
      questionId: "p1",
      optionId: "A",
      occurredAt: 1_200,
    });

    expect(afterFirstChoice.answers.p1).toMatchObject({
      selectedOptionId: "B",
      locked: true,
    });
    expect(afterFirstChoice.feedbackByQuestion.p1).toEqual({
      status: "incorrect",
      acceptedOptionIds: ["A"],
      solution: localized("Reviewed solution for p1"),
    });
    expect(state).toEqual(afterFirstChoice);
  });

  it("keeps answer correctness concealed during a strict mock", () => {
    const state = examSessionReducer(session("mock"), {
      type: "SELECT_OPTION",
      eventId: "event-1",
      questionId: "p1",
      optionId: "A",
      occurredAt: 1_100,
    });

    expect(state.answers.p1?.selectedOptionId).toBe("A");
    expect(state.feedbackByQuestion.p1).toBeUndefined();
  });

  it("prevents answering beyond an optional-section selection limit", () => {
    let state = session();

    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "event-1",
      questionId: "p1",
      optionId: "A",
      occurredAt: 1_100,
    });
    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "event-2",
      questionId: "p2",
      optionId: "B",
      occurredAt: 1_200,
    });

    expect(state.answers.p2).toBeUndefined();
    expect(state.limitWarning).toEqual({
      sectionId: "physics",
      selectionLimit: 1,
    });
    expect(state.eventQueue).toHaveLength(1);
  });

  it("requires confirmation before a manual submission", () => {
    let state = examSessionReducer(session(), {
      type: "REQUEST_SUBMIT",
      eventId: "time-submit-1",
      occurredAt: 1_500,
    });

    expect(state.status).toBe("submit_pending");
    expect(state.submissionReason).toBeUndefined();

    state = examSessionReducer(state, { type: "CANCEL_SUBMIT", occurredAt: 1_600 });
    expect(state.status).toBe("active");

    state = examSessionReducer(state, {
      type: "REQUEST_SUBMIT",
      eventId: "time-submit-2",
      occurredAt: 1_900,
    });
    state = examSessionReducer(state, { type: "CONFIRM_SUBMIT", submittedAt: 2_000 });

    expect(state.status).toBe("submitted");
    expect(state.submissionReason).toBe("manual");
    expect(state.submittedAt).toBe(2_000);
  });

  it("auto-submits against the server-authoritative deadline", () => {
    const state = examSessionReducer(session(), {
      type: "TICK",
      eventId: "time-expired",
      nowMs: 10_000,
    });

    expect(state.status).toBe("submitted");
    expect(state.submissionReason).toBe("expired");
    expect(state.submittedAt).toBe(10_000);
    expect(state.remainingMs).toBe(0);
  });

  it("records cumulative time across visits for the final answer", () => {
    let state = session();

    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "answer-1",
      questionId: "p1",
      optionId: "A",
      occurredAt: 2_500,
    });
    state = examSessionReducer(state, {
      type: "NAVIGATE",
      eventId: "time-p1-first-visit",
      questionId: "c1",
      occurredAt: 4_000,
    });
    state = examSessionReducer(state, {
      type: "NAVIGATE",
      eventId: "time-c1",
      questionId: "p1",
      occurredAt: 5_000,
    });
    state = examSessionReducer(state, {
      type: "SELECT_OPTION",
      eventId: "answer-2",
      questionId: "p1",
      optionId: "B",
      occurredAt: 7_000,
    });

    expect(state.eventQueue.map((event) => [event.type, event.timeSpentMs])).toEqual([
      ["answer_selected", 1_500],
      ["time_spent", 3_000],
      ["time_spent", 1_000],
      ["answer_selected", 5_000],
    ]);
    expect(materializeAnswers(state.eventQueue).p1).toEqual({
      selectedOptionId: "B",
      answeredAt: 7_000,
      timeSpentMs: 5_000,
    });
  });
});

describe("offline event reconciliation", () => {
  it("deduplicates events and materializes the latest ordered answer", () => {
    const local: AnswerEvent[] = [
      {
        id: "event-1",
        attemptId: "attempt-1",
        questionId: "p1",
        type: "answer_selected",
        selectedOptionId: "A",
        occurredAt: 1_100,
        clientSequence: 1,
        timeSpentMs: 100,
      },
      {
        id: "event-3",
        attemptId: "attempt-1",
        questionId: "p1",
        type: "answer_selected",
        selectedOptionId: "B",
        occurredAt: 1_300,
        clientSequence: 3,
        timeSpentMs: 300,
      },
    ];
    const remote: AnswerEvent[] = [
      { ...local[0] },
      {
        id: "event-2",
        attemptId: "attempt-1",
        questionId: "p1",
        type: "answer_cleared",
        occurredAt: 1_200,
        clientSequence: 2,
        timeSpentMs: 200,
      },
      {
        id: "event-4",
        attemptId: "attempt-1",
        questionId: "c1",
        type: "answer_selected",
        selectedOptionId: "C",
        occurredAt: 1_400,
        clientSequence: 4,
        timeSpentMs: 400,
      },
    ];

    const merged = mergeAnswerEvents(local, remote);

    expect(merged.map((event) => event.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
      "event-4",
    ]);
    expect(materializeAnswers(merged)).toEqual({
      p1: { selectedOptionId: "B", answeredAt: 1_300, timeSpentMs: 300 },
      c1: { selectedOptionId: "C", answeredAt: 1_400, timeSpentMs: 400 },
    });
  });
});
