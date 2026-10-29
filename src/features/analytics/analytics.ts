import {
  AttemptResultSchema,
  AttemptSchema,
  type Attempt,
  type AttemptResult,
  type PaperVersion,
  type Subject,
} from "@/features/exam/domain";
import {
  buildAttemptAnalytics,
  supportedSubjects,
} from "@/features/exam/scoring";

const minimumPercentileAttemptCount = 100;
const anonymousDisplayName = "Anonymous aspirant";

type PerformanceBucket = {
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  bonus: number;
  dropped: number;
  ignored: number;
  attempted: number;
  accuracyPercent: number;
  timeSpentMs: number;
};

export type SubjectPerformance = PerformanceBucket & {
  subject: Subject;
};

export type TopicPerformance = PerformanceBucket & {
  subject: Subject;
  topic: string;
};

export type PerformanceAnalytics = ReturnType<typeof buildAttemptAnalytics> & {
  subjects: SubjectPerformance[];
  topics: TopicPerformance[];
  pace: {
    fastest?: { questionId: string; timeSpentMs: number };
    slowest?: { questionId: string; timeSpentMs: number };
  };
};

function accuracyPercent(correct: number, incorrect: number) {
  const attempted = correct + incorrect;
  return attempted === 0 ? 0 : (correct / attempted) * 100;
}

export function buildPerformanceAnalytics(
  paper: PaperVersion,
  attempt: Attempt,
  policy: { eligibleAttemptCount: number },
): PerformanceAnalytics {
  const base = buildAttemptAnalytics(paper, attempt, policy);
  const answerByQuestionId = new Map(
    attempt.answers.map((answer) => [answer.questionId, answer]),
  );
  const resultByQuestionId = new Map(
    base.result.questionResults.map((result) => [result.questionId, result]),
  );
  const questionById = new Map(
    paper.questions.map((question) => [question.id, question]),
  );
  const subjects = supportedSubjects.map((subject) => {
    const totals = base.subjectTotals[subject];
    const timeSpentMs = attempt.answers.reduce((total, answer) => {
      const question = questionById.get(answer.questionId);
      return question?.subject === subject ? total + answer.timeSpentMs : total;
    }, 0);

    return {
      subject,
      ...totals,
      attempted: totals.correct + totals.incorrect,
      accuracyPercent: accuracyPercent(totals.correct, totals.incorrect),
      timeSpentMs,
    };
  });
  const topicBuckets = new Map<
    string,
    Omit<TopicPerformance, "attempted" | "accuracyPercent">
  >();

  for (const question of paper.questions) {
    const result = resultByQuestionId.get(question.id);
    if (!result) continue;

    const key = question.subject + ":" + question.topic;
    const bucket = topicBuckets.get(key) ?? {
      subject: question.subject,
      topic: question.topic,
      score: 0,
      maxScore: 0,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      bonus: 0,
      dropped: 0,
      ignored: 0,
      timeSpentMs: 0,
    };

    bucket.score += result.awardedMarks;
    bucket.maxScore += result.maxMarks;
    bucket[result.status] += 1;
    bucket.timeSpentMs += answerByQuestionId.get(question.id)?.timeSpentMs ?? 0;
    topicBuckets.set(key, bucket);
  }

  const topics = Array.from(topicBuckets.values()).map((bucket) => ({
    ...bucket,
    attempted: bucket.correct + bucket.incorrect,
    accuracyPercent: accuracyPercent(bucket.correct, bucket.incorrect),
  }));
  const timedAnswers = attempt.answers
    .map((answer) => ({
      questionId: answer.questionId,
      timeSpentMs: answer.timeSpentMs,
    }))
    .sort(
      (left, right) =>
        left.timeSpentMs - right.timeSpentMs ||
        left.questionId.localeCompare(right.questionId),
    );

  return {
    ...base,
    subjects,
    topics,
    pace: {
      fastest: timedAnswers[0],
      slowest: timedAnswers.at(-1),
    },
  };
}

export type LeaderboardCandidate = {
  displayName: string;
  hideDisplayName: boolean;
  isCurrentUser?: boolean;
  attempt: Attempt;
  result: AttemptResult;
};

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  anonymous: boolean;
  currentUser: boolean;
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  totalTimeMs: number;
  submittedAt: string;
  percentile?: number;
};

export type LeaderboardSnapshot = {
  eligibleAttemptCount: number;
  minimumAttemptCount: number;
  percentileStatus: "provisional" | "available";
  entries: LeaderboardEntry[];
};

type RankedCandidate = {
  displayName: string;
  hideDisplayName: boolean;
  isCurrentUser?: boolean;
  attempt: Attempt;
  result: AttemptResult;
  totalTimeMs: number;
};

function eligibleCandidate(candidate: LeaderboardCandidate) {
  const { attempt, result } = candidate;

  return (
    attempt.mode === "mock" &&
    attempt.strict &&
    attempt.attemptNumber === 1 &&
    attempt.visibility === "public" &&
    attempt.integrityStatus === "clear" &&
    Boolean(attempt.submittedAt) &&
    result.attemptId === attempt.id &&
    result.paperVersionId === attempt.paperVersionId
  );
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate) {
  return (
    right.result.score - left.result.score ||
    right.result.correct - left.result.correct ||
    left.result.incorrect - right.result.incorrect ||
    left.totalTimeMs - right.totalTimeMs ||
    (left.attempt.submittedAt ?? "").localeCompare(
      right.attempt.submittedAt ?? "",
    ) ||
    left.attempt.id.localeCompare(right.attempt.id)
  );
}

function percentileForScore(score: number, candidates: RankedCandidate[]) {
  const atOrBelow = candidates.filter(
    (candidate) => candidate.result.score <= score,
  ).length;
  return Math.round((atOrBelow / candidates.length) * 10_000) / 100;
}

export function buildLeaderboard(
  candidateInputs: LeaderboardCandidate[],
): LeaderboardSnapshot {
  const ranked = candidateInputs
    .map((candidate) => ({
      ...candidate,
      attempt: AttemptSchema.parse(candidate.attempt),
      result: AttemptResultSchema.parse(candidate.result),
      totalTimeMs: candidate.attempt.answers.reduce(
        (total, answer) => total + answer.timeSpentMs,
        0,
      ),
    }))
    .filter(eligibleCandidate)
    .sort(compareCandidates);
  const percentileStatus =
    ranked.length >= minimumPercentileAttemptCount
      ? ("available" as const)
      : ("provisional" as const);

  return {
    eligibleAttemptCount: ranked.length,
    minimumAttemptCount: minimumPercentileAttemptCount,
    percentileStatus,
    entries: ranked.map((candidate, index) => ({
      rank: index + 1,
      displayName: candidate.hideDisplayName
        ? anonymousDisplayName
        : candidate.displayName,
      anonymous: candidate.hideDisplayName,
      currentUser: Boolean(candidate.isCurrentUser),
      score: candidate.result.score,
      maxScore: candidate.result.maxScore,
      correct: candidate.result.correct,
      incorrect: candidate.result.incorrect,
      totalTimeMs: candidate.totalTimeMs,
      submittedAt: candidate.attempt.submittedAt!,
      ...(percentileStatus === "available"
        ? {
            percentile: percentileForScore(candidate.result.score, ranked),
          }
        : {}),
    })),
  };
}
