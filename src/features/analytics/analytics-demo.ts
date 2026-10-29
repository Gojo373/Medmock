import { buildLeaderboard } from "@/features/analytics/analytics";
import type { AttemptHistoryItem } from "@/features/analytics/analytics-workspace";
import { AttemptSchema, type Attempt } from "@/features/exam/domain";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { scoreAttempt } from "@/features/exam/scoring";

function createAttempt({
  id,
  userId,
  submittedAt,
  answers,
}: {
  id: string;
  userId: string;
  submittedAt: string;
  answers: Attempt["answers"];
}) {
  return AttemptSchema.parse({
    id,
    userId,
    paperVersionId: sampleExamPaper.id,
    mode: "mock",
    strict: true,
    attemptNumber: 1,
    visibility: "public",
    integrityStatus: "clear",
    startedAt: "2026-10-28T09:00:00.000Z",
    deadlineAt: "2026-10-28T12:00:00.000Z",
    submittedAt,
    answers,
  });
}

function toHistoryItem(attempt: Attempt): AttemptHistoryItem {
  return {
    paper: sampleExamPaper,
    attempt,
    result: scoreAttempt(sampleExamPaper, attempt),
  };
}

const currentAttempt = createAttempt({
  id: "attempt-current",
  userId: "student-current",
  submittedAt: "2026-10-28T12:00:00.000Z",
  answers: [
    {
      questionId: "physics-1",
      selectedOptionId: "B",
      answeredAt: "2026-10-28T09:01:00.000Z",
      timeSpentMs: 35_000,
    },
    {
      questionId: "physics-2",
      selectedOptionId: "A",
      answeredAt: "2026-10-28T09:03:00.000Z",
      timeSpentMs: 75_000,
    },
    {
      questionId: "chemistry-1",
      selectedOptionId: "C",
      answeredAt: "2026-10-28T09:04:00.000Z",
      timeSpentMs: 28_000,
    },
    {
      questionId: "biology-1",
      selectedOptionId: "A",
      answeredAt: "2026-10-28T09:06:00.000Z",
      timeSpentMs: 52_000,
    },
  ],
});

const rivalAttempt = createAttempt({
  id: "attempt-rival",
  userId: "student-rival",
  submittedAt: "2026-10-28T11:58:00.000Z",
  answers: [
    {
      questionId: "physics-1",
      selectedOptionId: "B",
      answeredAt: "2026-10-28T09:01:00.000Z",
      timeSpentMs: 25_000,
    },
    {
      questionId: "physics-2",
      selectedOptionId: "B",
      answeredAt: "2026-10-28T09:02:00.000Z",
      timeSpentMs: 30_000,
    },
    {
      questionId: "chemistry-1",
      selectedOptionId: "C",
      answeredAt: "2026-10-28T09:03:00.000Z",
      timeSpentMs: 30_000,
    },
    {
      questionId: "biology-1",
      selectedOptionId: "B",
      answeredAt: "2026-10-28T09:04:00.000Z",
      timeSpentMs: 32_000,
    },
  ],
});

const currentHistoryItem = toHistoryItem(currentAttempt);
const rivalHistoryItem = toHistoryItem(rivalAttempt);

export const analyticsDemo = {
  currentAttempt: currentHistoryItem,
  eligibleAttemptCount: 64,
  history: [currentHistoryItem],
  leaderboard: buildLeaderboard([
    {
      displayName: "You",
      hideDisplayName: false,
      isCurrentUser: true,
      attempt: currentAttempt,
      result: currentHistoryItem.result,
    },
    {
      displayName: "Riya Sharma",
      hideDisplayName: false,
      attempt: rivalAttempt,
      result: rivalHistoryItem.result,
    },
  ]),
};
