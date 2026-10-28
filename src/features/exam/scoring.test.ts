import { describe, expect, it } from "vitest";

import { AttemptSchema, PaperVersionSchema } from "@/features/exam/domain";
import { buildAttemptAnalytics, scoreAttempt } from "@/features/exam/scoring";

type Subject = "physics" | "chemistry" | "biology";

type QuestionInput = {
  id: string;
  sectionId: string;
  subject: Subject;
  acceptedOptionIds?: string[];
  disposition?: "standard" | "bonus" | "dropped";
  topic?: string;
};

type AnswerInput = {
  questionId: string;
  selectedOptionId: string;
  answeredAt: string;
  timeSpentMs?: number;
};

function localized(value: string) {
  return { en: value, hi: `${value} हिंदी` };
}

function question({
  id,
  sectionId,
  subject,
  acceptedOptionIds = ["A"],
  disposition = "standard",
  topic = "General",
}: QuestionInput) {
  return {
    id,
    sectionId,
    subject,
    topic,
    stem: localized(`Question ${id}`),
    options: ["A", "B", "C", "D"].map((optionId) => ({
      id: optionId,
      text: localized(`Option ${optionId}`),
    })),
    acceptedOptionIds: disposition === "standard" ? acceptedOptionIds : [],
    disposition,
    marking: {
      correct: 4,
      incorrect: -1,
      unattempted: 0,
    },
  };
}

function paper(
  questions: ReturnType<typeof question>[],
  selectionLimits: Record<string, number | undefined> = {},
) {
  const sections = Array.from(new Set(questions.map((item) => item.sectionId))).map(
    (sectionId) => {
      const sectionQuestions = questions.filter((item) => item.sectionId === sectionId);

      return {
        id: sectionId,
        subject: sectionQuestions[0].subject,
        title: localized(sectionId),
        questionIds: sectionQuestions.map((item) => item.id),
        selectionLimit: selectionLimits[sectionId],
      };
    },
  );

  return PaperVersionSchema.parse({
    schemaVersion: 1,
    id: "version-1",
    paperId: "paper-1",
    revision: 1,
    status: "published",
    title: localized("NEET test paper"),
    durationMinutes: 180,
    publishedAt: "2026-10-28T06:00:00.000Z",
    sections,
    questions,
  });
}

function attempt(answers: AnswerInput[], overrides: Record<string, unknown> = {}) {
  return AttemptSchema.parse({
    id: "attempt-1",
    userId: "student-1",
    paperVersionId: "version-1",
    mode: "mock",
    strict: true,
    attemptNumber: 1,
    visibility: "public",
    integrityStatus: "clear",
    startedAt: "2026-10-28T06:00:00.000Z",
    deadlineAt: "2026-10-28T09:00:00.000Z",
    submittedAt: "2026-10-28T08:45:00.000Z",
    answers: answers.map((answer) => ({
      timeSpentMs: 30_000,
      ...answer,
    })),
    ...overrides,
  });
}

describe("scoreAttempt", () => {
  it("applies positive, negative, and unattempted NEET marks", () => {
    const version = paper([
      question({ id: "p1", sectionId: "physics", subject: "physics" }),
      question({ id: "p2", sectionId: "physics", subject: "physics" }),
      question({ id: "p3", sectionId: "physics", subject: "physics" }),
    ]);
    const submittedAttempt = attempt([
      {
        questionId: "p1",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T06:10:00.000Z",
      },
      {
        questionId: "p2",
        selectedOptionId: "B",
        answeredAt: "2026-10-28T06:11:00.000Z",
      },
    ]);

    const result = scoreAttempt(version, submittedAttempt);

    expect(result.score).toBe(3);
    expect(result.maxScore).toBe(12);
    expect(result.correct).toBe(1);
    expect(result.incorrect).toBe(1);
    expect(result.unanswered).toBe(1);
  });

  it("scores only the earliest answers up to an optional-section limit", () => {
    const version = paper(
      [
        question({ id: "b1", sectionId: "biology-b", subject: "biology" }),
        question({ id: "b2", sectionId: "biology-b", subject: "biology" }),
        question({ id: "b3", sectionId: "biology-b", subject: "biology" }),
      ],
      { "biology-b": 2 },
    );
    const submittedAttempt = attempt([
      {
        questionId: "b3",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T06:12:00.000Z",
      },
      {
        questionId: "b1",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T06:10:00.000Z",
      },
      {
        questionId: "b2",
        selectedOptionId: "B",
        answeredAt: "2026-10-28T06:11:00.000Z",
      },
    ]);

    const result = scoreAttempt(version, submittedAttempt);

    expect(result.score).toBe(3);
    expect(result.maxScore).toBe(8);
    expect(result.ignored).toBe(1);
    expect(result.questionResults.find((item) => item.questionId === "b3")).toMatchObject({
      status: "ignored",
      awardedMarks: 0,
    });
  });

  it("accepts any option listed in a reviewed multiple-answer key", () => {
    const version = paper([
      question({
        id: "c1",
        sectionId: "chemistry",
        subject: "chemistry",
        acceptedOptionIds: ["A", "C"],
      }),
    ]);
    const submittedAttempt = attempt([
      {
        questionId: "c1",
        selectedOptionId: "C",
        answeredAt: "2026-10-28T06:10:00.000Z",
      },
    ]);

    expect(scoreAttempt(version, submittedAttempt).score).toBe(4);
  });

  it("awards reviewed bonus marks and removes dropped questions from the maximum", () => {
    const version = paper([
      question({
        id: "p1",
        sectionId: "physics",
        subject: "physics",
        disposition: "bonus",
      }),
      question({
        id: "p2",
        sectionId: "physics",
        subject: "physics",
        disposition: "dropped",
      }),
      question({ id: "p3", sectionId: "physics", subject: "physics" }),
    ]);
    const submittedAttempt = attempt([
      {
        questionId: "p2",
        selectedOptionId: "B",
        answeredAt: "2026-10-28T06:10:00.000Z",
      },
      {
        questionId: "p3",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T06:11:00.000Z",
      },
    ]);

    const result = scoreAttempt(version, submittedAttempt);

    expect(result.score).toBe(8);
    expect(result.maxScore).toBe(8);
    expect(result.bonus).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.incorrect).toBe(0);
  });

  it("builds independent totals for physics, chemistry, and biology", () => {
    const version = paper([
      question({ id: "p1", sectionId: "physics", subject: "physics" }),
      question({ id: "c1", sectionId: "chemistry", subject: "chemistry" }),
      question({ id: "b1", sectionId: "biology", subject: "biology" }),
    ]);
    const submittedAttempt = attempt([
      {
        questionId: "p1",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T06:10:00.000Z",
      },
      {
        questionId: "c1",
        selectedOptionId: "B",
        answeredAt: "2026-10-28T06:11:00.000Z",
      },
    ]);

    const result = scoreAttempt(version, submittedAttempt);

    expect(result.subjectTotals).toEqual({
      physics: {
        score: 4,
        maxScore: 4,
        correct: 1,
        incorrect: 0,
        unanswered: 0,
        bonus: 0,
        dropped: 0,
        ignored: 0,
      },
      chemistry: {
        score: -1,
        maxScore: 4,
        correct: 0,
        incorrect: 1,
        unanswered: 0,
        bonus: 0,
        dropped: 0,
        ignored: 0,
      },
      biology: {
        score: 0,
        maxScore: 4,
        correct: 0,
        incorrect: 0,
        unanswered: 1,
        bonus: 0,
        dropped: 0,
        ignored: 0,
      },
    });
  });
});

describe("buildAttemptAnalytics", () => {
  it("keeps percentile provisional until 100 eligible first strict mocks exist", () => {
    const version = paper([
      question({ id: "p1", sectionId: "physics", subject: "physics" }),
    ]);
    const submittedAttempt = attempt([]);

    const analytics = buildAttemptAnalytics(version, submittedAttempt, {
      eligibleAttemptCount: 99,
    });

    expect(analytics.leaderboard).toEqual({
      eligible: true,
      reasons: [],
      percentile: {
        status: "provisional",
        eligibleAttemptCount: 99,
        minimumAttemptCount: 100,
      },
    });
  });

  it("makes percentile available at the 100-attempt eligibility threshold", () => {
    const version = paper([
      question({ id: "p1", sectionId: "physics", subject: "physics" }),
    ]);
    const submittedAttempt = attempt([]);

    const analytics = buildAttemptAnalytics(version, submittedAttempt, {
      eligibleAttemptCount: 100,
    });

    expect(analytics.leaderboard.percentile.status).toBe("available");
  });

  it("excludes later strict mocks from public ranking and percentile", () => {
    const version = paper([
      question({ id: "p1", sectionId: "physics", subject: "physics" }),
    ]);
    const laterAttempt = attempt([], { attemptNumber: 2 });

    const analytics = buildAttemptAnalytics(version, laterAttempt, {
      eligibleAttemptCount: 200,
    });

    expect(analytics.leaderboard).toEqual({
      eligible: false,
      reasons: ["not-first-strict-mock"],
      percentile: {
        status: "ineligible",
        eligibleAttemptCount: 200,
        minimumAttemptCount: 100,
      },
    });
  });
});
