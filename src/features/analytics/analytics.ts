import {
  AttemptResultSchema,
  AttemptSchema,
  PaperVersionSchema,
  type Attempt,
  type AttemptResult,
  type PaperVersion,
  type Subject,
} from "@/features/exam/domain";
import {
  buildAttemptAnalytics,
  getAttemptQuestionTimes,
  supportedSubjects,
} from "@/features/exam/scoring";
import {
  materializeAnswers,
  materializeQuestionTimes,
  type AnswerEvent,
} from "@/features/exam/session";
import {
  normalizeDatabaseTimestamp,
  normalizeNullableDatabaseTimestamp,
} from "@/lib/database-timestamps";

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
  const questionTimes = getAttemptQuestionTimes(attempt);
  const resultByQuestionId = new Map(
    base.result.questionResults.map((result) => [result.questionId, result]),
  );
  const questionById = new Map(
    paper.questions.map((question) => [question.id, question]),
  );
  const subjects = supportedSubjects.map((subject) => {
    const totals = base.subjectTotals[subject];
    const timeSpentMs = Object.entries(questionTimes).reduce((total, [questionId, time]) => {
      const question = questionById.get(questionId);
      return question?.subject === subject ? total + time : total;
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
    bucket.timeSpentMs += questionTimes[question.id] ?? 0;
    topicBuckets.set(key, bucket);
  }

  const topics = Array.from(topicBuckets.values()).map((bucket) => ({
    ...bucket,
    attempted: bucket.correct + bucket.incorrect,
    accuracyPercent: accuracyPercent(bucket.correct, bucket.incorrect),
  }));
  const timedAnswers = Object.entries(questionTimes)
    .filter(([, time]) => time > 0)
    .map(([questionId, timeSpentMs]) => ({
      questionId,
      timeSpentMs,
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

type DashboardRowInput = {
  userId: string;
  profile?: { hide_display_name?: boolean } | null;
  attemptRows: Array<Record<string, unknown>>;
  resultRows: Array<Record<string, unknown>>;
  paperRows: Array<Record<string, unknown>>;
  eventRows: Array<Record<string, unknown>>;
  leaderboardRows: Array<Record<string, unknown>>;
};

function answerEventFromDashboardRow(row: Record<string, unknown>): AnswerEvent {
  return {
    id: String(row.id),
    attemptId: String(row.attempt_id),
    questionId: String(row.question_id),
    type: row.event_type as AnswerEvent["type"],
    ...(row.selected_option_id
      ? { selectedOptionId: String(row.selected_option_id) }
      : {}),
    occurredAt: Number(row.occurred_at_ms),
    clientSequence: Number(row.client_sequence),
    timeSpentMs: Number(row.time_spent_ms ?? 0),
  };
}

export function buildDashboardDataFromRows(input: DashboardRowInput) {
  const resultByAttemptId = new Map(
    input.resultRows.map((row) => [String(row.attempt_id), row.result]),
  );
  const paperById = new Map(
    input.paperRows.map((row) => [
      String(row.id),
      PaperVersionSchema.parse(row.content),
    ]),
  );
  const eventsByAttemptId = new Map<string, AnswerEvent[]>();

  for (const row of input.eventRows) {
    const event = answerEventFromDashboardRow(row);
    const events = eventsByAttemptId.get(event.attemptId) ?? [];
    events.push(event);
    eventsByAttemptId.set(event.attemptId, events);
  }

  const history = input.attemptRows
    .flatMap((row) => {
      const attemptId = String(row.id);
      const paperVersionId = String(row.paper_version_id);
      const paper = paperById.get(paperVersionId);
      const resultInput = resultByAttemptId.get(attemptId);
      if (!paper || !resultInput) return [];

      const materialized = materializeAnswers(
        eventsByAttemptId.get(attemptId) ?? [],
      );
      const attempt = AttemptSchema.parse({
        id: attemptId,
        userId: row.user_id,
        paperVersionId,
        mode: row.mode,
        strict: row.strict,
        attemptNumber: row.attempt_number,
        visibility: row.visibility,
        integrityStatus: row.integrity_status,
        startedAt: normalizeDatabaseTimestamp(row.started_at),
        deadlineAt: normalizeDatabaseTimestamp(row.deadline_at),
        submittedAt: normalizeNullableDatabaseTimestamp(row.submitted_at),
        timeSpentByQuestionMs: materializeQuestionTimes(eventsByAttemptId.get(attemptId) ?? []),
        answers: paper.questions.flatMap((question) => {
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
        }),
      });

      return [{ paper, attempt, result: AttemptResultSchema.parse(resultInput) }];
    })
    .sort((left, right) =>
      (right.attempt.submittedAt ?? right.attempt.startedAt).localeCompare(
        left.attempt.submittedAt ?? left.attempt.startedAt,
      ),
    );
  const currentAttempt = history[0];

  if (!currentAttempt) return undefined;

  const currentEligibleAttempt = history.find(
    ({ attempt }) =>
      attempt.userId === input.userId &&
      attempt.mode === "mock" &&
      attempt.strict &&
      attempt.attemptNumber === 1 &&
      attempt.visibility === "public" &&
      attempt.integrityStatus === "clear",
  );
  const entries = input.leaderboardRows.map((row) => {
    const submittedAt = normalizeDatabaseTimestamp(row.submitted_at);
    const score = Number(row.score);
    const correct = Number(row.correct);
    const incorrect = Number(row.incorrect);
    const currentUser = Boolean(
      currentEligibleAttempt &&
        currentEligibleAttempt.attempt.submittedAt === submittedAt &&
        currentEligibleAttempt.result.score === score &&
        currentEligibleAttempt.result.correct === correct &&
        currentEligibleAttempt.result.incorrect === incorrect,
    );
    const percentile = row.percentile;

    return {
      rank: Number(row.rank),
      displayName: String(row.display_name),
      anonymous: row.display_name === "Anonymous aspirant",
      currentUser,
      score,
      maxScore: Number(row.max_score),
      correct,
      incorrect,
      totalTimeMs: Number(row.total_time_ms),
      submittedAt,
      ...(percentile === null || percentile === undefined
        ? {}
        : { percentile: Number(percentile) }),
    };
  });
  const eligibleAttemptCount = entries.length;

  return {
    currentAttempt,
    history,
    eligibleAttemptCount,
    initialHideName: Boolean(input.profile?.hide_display_name),
    leaderboard: {
      eligibleAttemptCount,
      minimumAttemptCount: minimumPercentileAttemptCount,
      percentileStatus:
        eligibleAttemptCount >= minimumPercentileAttemptCount
          ? ("available" as const)
          : ("provisional" as const),
      entries,
    },
  };
}

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
      totalTimeMs: Object.values(getAttemptQuestionTimes(candidate.attempt)).reduce((total, time) => total + time, 0),
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
