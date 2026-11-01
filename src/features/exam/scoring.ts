import { z } from "zod";

import {
  AttemptResultSchema,
  AttemptSchema,
  PaperVersionSchema,
  type Attempt,
  type AttemptResult,
  type PaperSection,
  type PaperVersion,
  type Question,
  type QuestionResult,
  type Subject,
  type SubjectScore,
} from "@/features/exam/domain";

const subjects: Subject[] = ["physics", "chemistry", "biology"];
const minimumPercentileAttemptCount = 100;

function emptySubjectScore(): SubjectScore {
  return {
    score: 0,
    maxScore: 0,
    correct: 0,
    incorrect: 0,
    unanswered: 0,
    bonus: 0,
    dropped: 0,
    ignored: 0,
  };
}

function createSubjectTotals(): Record<Subject, SubjectScore> {
  return {
    physics: emptySubjectScore(),
    chemistry: emptySubjectScore(),
    biology: emptySubjectScore(),
  };
}

function getSelectedQuestionIds(
  section: PaperSection,
  questions: Question[],
  answersByQuestionId: Map<string, Attempt["answers"][number]>,
) {
  const scorableQuestions = questions.filter((question) => question.disposition !== "dropped");

  if (!section.selectionLimit) {
    return new Set(scorableQuestions.map((question) => question.id));
  }

  const questionOrder = new Map(
    questions.map((question, index) => [question.id, index] as const),
  );
  const bonusQuestions = scorableQuestions.filter(
    (question) => question.disposition === "bonus",
  );
  const answeredStandardQuestions = scorableQuestions
    .filter(
      (question) =>
        question.disposition === "standard" && answersByQuestionId.has(question.id),
    )
    .sort((left, right) => {
      const leftAnswer = answersByQuestionId.get(left.id);
      const rightAnswer = answersByQuestionId.get(right.id);
      const timestampComparison =
        (leftAnswer?.answeredAt ?? "").localeCompare(rightAnswer?.answeredAt ?? "");

      if (timestampComparison !== 0) {
        return timestampComparison;
      }

      return (questionOrder.get(left.id) ?? 0) - (questionOrder.get(right.id) ?? 0);
    });

  const prioritizedIds = new Set([
    ...bonusQuestions.map((question) => question.id),
    ...answeredStandardQuestions.map((question) => question.id),
  ]);
  const unansweredStandardQuestions = scorableQuestions.filter(
    (question) =>
      question.disposition === "standard" && !prioritizedIds.has(question.id),
  );
  const prioritizedQuestions = [
    ...bonusQuestions,
    ...answeredStandardQuestions,
    ...unansweredStandardQuestions,
  ];

  return new Set(
    prioritizedQuestions
      .slice(0, Math.min(section.selectionLimit, scorableQuestions.length))
      .map((question) => question.id),
  );
}

function addQuestionResult(
  result: QuestionResult,
  subjectTotals: Record<Subject, SubjectScore>,
  summary: Omit<AttemptResult, "attemptId" | "paperVersionId" | "questionResults" | "subjectTotals">,
) {
  const subject = subjectTotals[result.subject];

  subject.score += result.awardedMarks;
  subject.maxScore += result.maxMarks;
  summary.score += result.awardedMarks;
  summary.maxScore += result.maxMarks;

  switch (result.status) {
    case "correct":
      subject.correct += 1;
      summary.correct += 1;
      break;
    case "incorrect":
      subject.incorrect += 1;
      summary.incorrect += 1;
      break;
    case "unanswered":
      subject.unanswered += 1;
      summary.unanswered += 1;
      break;
    case "bonus":
      subject.bonus += 1;
      summary.bonus += 1;
      break;
    case "dropped":
      subject.dropped += 1;
      summary.dropped += 1;
      break;
    case "ignored":
      subject.ignored += 1;
      summary.ignored += 1;
      break;
  }
}

export function getAttemptQuestionTimes(attempt: Attempt) {
  const times = { ...attempt.timeSpentByQuestionMs };
  for (const answer of attempt.answers) {
    times[answer.questionId] = Math.max(times[answer.questionId] ?? 0, answer.timeSpentMs);
  }
  return times;
}

export function scoreAttempt(
  paperInput: PaperVersion,
  attemptInput: Attempt,
): AttemptResult {
  const paper = PaperVersionSchema.parse(paperInput);
  const attempt = AttemptSchema.parse(attemptInput);

  if (paper.id !== attempt.paperVersionId) {
    throw new Error("Attempt paper version does not match the paper being scored.");
  }

  const questionById = new Map(paper.questions.map((question) => [question.id, question]));
  const answersByQuestionId = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );
  for (const questionId of Object.keys(attempt.timeSpentByQuestionMs ?? {})) {
    if (!questionById.has(questionId)) throw new Error("Attempt contains time for an unknown question.");
  }

  for (const answer of attempt.answers) {
    const question = questionById.get(answer.questionId);

    if (!question) {
      throw new Error("Attempt contains an answer for an unknown question.");
    }

    if (!question.options.some((option) => option.id === answer.selectedOptionId)) {
      throw new Error("Attempt contains an option that does not belong to its question.");
    }
  }

  const subjectTotals = createSubjectTotals();
  const questionResults: QuestionResult[] = [];
  const summary = {
    score: 0,
    maxScore: 0,
    correct: 0,
    incorrect: 0,
    unanswered: 0,
    bonus: 0,
    dropped: 0,
    ignored: 0,
  };

  for (const section of paper.sections) {
    const sectionQuestions = section.questionIds.map((questionId) => {
      const question = questionById.get(questionId);

      if (!question) {
        throw new Error("Paper section references an unknown question.");
      }

      return question;
    });
    const selectedQuestionIds = getSelectedQuestionIds(
      section,
      sectionQuestions,
      answersByQuestionId,
    );

    for (const question of sectionQuestions) {
      const answer = answersByQuestionId.get(question.id);
      let questionResult: QuestionResult;

      if (question.disposition === "dropped") {
        questionResult = {
          questionId: question.id,
          subject: question.subject,
          status: "dropped",
          selectedOptionId: answer?.selectedOptionId,
          awardedMarks: 0,
          maxMarks: 0,
        };
      } else if (!selectedQuestionIds.has(question.id)) {
        questionResult = {
          questionId: question.id,
          subject: question.subject,
          status: "ignored",
          selectedOptionId: answer?.selectedOptionId,
          awardedMarks: 0,
          maxMarks: 0,
        };
      } else if (question.disposition === "bonus") {
        questionResult = {
          questionId: question.id,
          subject: question.subject,
          status: "bonus",
          selectedOptionId: answer?.selectedOptionId,
          awardedMarks: question.marking.correct,
          maxMarks: question.marking.correct,
        };
      } else if (!answer) {
        questionResult = {
          questionId: question.id,
          subject: question.subject,
          status: "unanswered",
          awardedMarks: question.marking.unattempted,
          maxMarks: question.marking.correct,
        };
      } else if (question.acceptedOptionIds.includes(answer.selectedOptionId)) {
        questionResult = {
          questionId: question.id,
          subject: question.subject,
          status: "correct",
          selectedOptionId: answer.selectedOptionId,
          awardedMarks: question.marking.correct,
          maxMarks: question.marking.correct,
        };
      } else {
        questionResult = {
          questionId: question.id,
          subject: question.subject,
          status: "incorrect",
          selectedOptionId: answer.selectedOptionId,
          awardedMarks: question.marking.incorrect,
          maxMarks: question.marking.correct,
        };
      }

      questionResults.push(questionResult);
      addQuestionResult(questionResult, subjectTotals, summary);
    }
  }

  return AttemptResultSchema.parse({
    attemptId: attempt.id,
    paperVersionId: paper.id,
    ...summary,
    questionResults,
    ...(attempt.timeSpentByQuestionMs ? { timeSpentByQuestionMs: getAttemptQuestionTimes(attempt) } : {}),
    subjectTotals,
  });
}

export type LeaderboardIneligibilityReason =
  | "not-strict-mock"
  | "not-first-strict-mock"
  | "integrity-flagged"
  | "private-attempt"
  | "not-submitted";

export type AttemptAnalytics = {
  result: AttemptResult;
  overall: {
    attempted: number;
    accuracyPercent: number;
    totalTimeMs: number;
    averageTimePerAnsweredMs: number;
    visited: number;
    averageTimePerVisitedMs: number;
  };
  subjectTotals: Record<Subject, SubjectScore>;
  leaderboard: {
    eligible: boolean;
    reasons: LeaderboardIneligibilityReason[];
    percentile: {
      status: "ineligible" | "provisional" | "available";
      eligibleAttemptCount: number;
      minimumAttemptCount: number;
    };
  };
};

export function buildAttemptAnalytics(
  paper: PaperVersion,
  attempt: Attempt,
  policy: { eligibleAttemptCount: number },
): AttemptAnalytics {
  const eligibleAttemptCount = z.number().int().nonnegative().parse(policy.eligibleAttemptCount);
  const result = scoreAttempt(paper, attempt);
  const reasons: LeaderboardIneligibilityReason[] = [];

  if (attempt.mode !== "mock" || !attempt.strict) {
    reasons.push("not-strict-mock");
  }

  if (attempt.attemptNumber !== 1) {
    reasons.push("not-first-strict-mock");
  }

  if (attempt.integrityStatus !== "clear") {
    reasons.push("integrity-flagged");
  }

  if (attempt.visibility !== "public") {
    reasons.push("private-attempt");
  }

  if (!attempt.submittedAt) {
    reasons.push("not-submitted");
  }

  const eligible = reasons.length === 0;
  const attempted = result.correct + result.incorrect;
  const questionTimes = getAttemptQuestionTimes(attempt);
  const totalTimeMs = Object.values(questionTimes).reduce((total, time) => total + time, 0);
  const visited = Object.values(questionTimes).filter((time) => time > 0).length;
  const answeredTimeMs = attempt.answers.reduce(
    (total, answer) => total + questionTimes[answer.questionId],
    0,
  );

  return {
    result,
    overall: {
      attempted,
      accuracyPercent: attempted === 0 ? 0 : (result.correct / attempted) * 100,
      totalTimeMs,
      visited,
      averageTimePerVisitedMs: visited ? totalTimeMs / visited : 0,
      averageTimePerAnsweredMs: attempt.answers.length
        ? answeredTimeMs / attempt.answers.length
        : 0,
    },
    subjectTotals: result.subjectTotals,
    leaderboard: {
      eligible,
      reasons,
      percentile: {
        status: !eligible
          ? "ineligible"
          : eligibleAttemptCount >= minimumPercentileAttemptCount
            ? "available"
            : "provisional",
        eligibleAttemptCount,
        minimumAttemptCount: minimumPercentileAttemptCount,
      },
    },
  };
}

export const supportedSubjects = subjects;
