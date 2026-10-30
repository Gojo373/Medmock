import { describe, expect, it } from "vitest";

import {
  AttemptSchema,
  PaperVersionSchema,
  type Attempt,
  type PaperVersion,
} from "@/features/exam/domain";
import { scoreAttempt } from "@/features/exam/scoring";
import {
  buildLeaderboard,
  buildPerformanceAnalytics,
  type LeaderboardCandidate,
} from "@/features/analytics/analytics";
import * as analyticsModule from "@/features/analytics/analytics";

const localized = (en: string) => ({ en, hi: en + " हिंदी" });

function question(
  id: string,
  sectionId: "physics" | "chemistry",
  subject: "physics" | "chemistry",
  topic: string,
) {
  return {
    id,
    sectionId,
    subject,
    topic,
    stem: localized("Question " + id),
    options: [
      { id: "A", text: localized("Correct") },
      { id: "B", text: localized("Incorrect") },
    ],
    acceptedOptionIds: ["A"],
    solution: localized("Reviewed solution"),
    disposition: "standard" as const,
    marking: { correct: 4, incorrect: -1, unattempted: 0 },
  };
}

function paper(): PaperVersion {
  return PaperVersionSchema.parse({
    schemaVersion: 1,
    id: "analytics-paper-v1",
    paperId: "analytics-paper",
    revision: 1,
    status: "published",
    title: localized("Analytics paper"),
    durationMinutes: 180,
    publishedAt: "2026-10-28T09:00:00.000Z",
    sections: [
      {
        id: "physics",
        subject: "physics",
        title: localized("Physics"),
        questionIds: ["p1", "p2"],
      },
      {
        id: "chemistry",
        subject: "chemistry",
        title: localized("Chemistry"),
        questionIds: ["c1"],
      },
    ],
    questions: [
      question("p1", "physics", "physics", "Kinematics"),
      question("p2", "physics", "physics", "Kinematics"),
      question("c1", "chemistry", "chemistry", "Chemical Bonding"),
    ],
  });
}

function performanceAttempt(version: PaperVersion) {
  return AttemptSchema.parse({
    id: "performance-attempt",
    userId: "student-performance",
    paperVersionId: version.id,
    mode: "mock",
    strict: true,
    attemptNumber: 1,
    visibility: "public",
    integrityStatus: "clear",
    startedAt: "2026-10-28T10:00:00.000Z",
    deadlineAt: "2026-10-28T13:00:00.000Z",
    submittedAt: "2026-10-28T11:30:00.000Z",
    answers: [
      {
        questionId: "p1",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T10:01:00.000Z",
        timeSpentMs: 30_000,
      },
      {
        questionId: "p2",
        selectedOptionId: "B",
        answeredAt: "2026-10-28T10:03:00.000Z",
        timeSpentMs: 70_000,
      },
      {
        questionId: "c1",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T10:04:00.000Z",
        timeSpentMs: 20_000,
      },
    ],
  });
}

function candidate({
  id,
  displayName,
  hideDisplayName = false,
  timeSpentMs = 20_000,
  submittedAt = "2026-10-28T11:00:00.000Z",
  overrides = {},
}: {
  id: string;
  displayName: string;
  hideDisplayName?: boolean;
  timeSpentMs?: number;
  submittedAt?: string;
  overrides?: Partial<Attempt>;
}): LeaderboardCandidate {
  const version = paper();
  const attempt = AttemptSchema.parse({
    id,
    userId: "user-" + id,
    paperVersionId: version.id,
    mode: "mock",
    strict: true,
    attemptNumber: 1,
    visibility: "public",
    integrityStatus: "clear",
    startedAt: "2026-10-28T10:00:00.000Z",
    deadlineAt: "2026-10-28T13:00:00.000Z",
    submittedAt,
    answers: [
      {
        questionId: "p1",
        selectedOptionId: "A",
        answeredAt: "2026-10-28T10:01:00.000Z",
        timeSpentMs,
      },
    ],
    ...overrides,
  });

  return {
    displayName,
    hideDisplayName,
    attempt,
    result: scoreAttempt(version, attempt),
  };
}

describe("buildPerformanceAnalytics", () => {
  it("aggregates reviewed results by subject, topic, and answer pace", () => {
    const version = paper();
    const attempt = performanceAttempt(version);

    const analytics = buildPerformanceAnalytics(version, attempt, {
      eligibleAttemptCount: 64,
    });

    expect(analytics.overall).toMatchObject({
      attempted: 3,
      totalTimeMs: 120_000,
      averageTimePerAnsweredMs: 40_000,
    });
    expect(analytics.overall.accuracyPercent).toBeCloseTo(200 / 3);
    expect(analytics.subjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "physics",
          score: 3,
          maxScore: 8,
          attempted: 2,
          accuracyPercent: 50,
          timeSpentMs: 100_000,
        }),
        expect.objectContaining({
          subject: "chemistry",
          score: 4,
          maxScore: 4,
          attempted: 1,
          accuracyPercent: 100,
          timeSpentMs: 20_000,
        }),
      ]),
    );
    expect(analytics.topics).toEqual([
      expect.objectContaining({
        subject: "physics",
        topic: "Kinematics",
        score: 3,
        maxScore: 8,
        correct: 1,
        incorrect: 1,
        accuracyPercent: 50,
        timeSpentMs: 100_000,
      }),
      expect.objectContaining({
        subject: "chemistry",
        topic: "Chemical Bonding",
        score: 4,
        maxScore: 4,
        correct: 1,
        incorrect: 0,
        accuracyPercent: 100,
        timeSpentMs: 20_000,
      }),
    ]);
    expect(analytics.pace).toEqual({
      fastest: { questionId: "c1", timeSpentMs: 20_000 },
      slowest: { questionId: "p2", timeSpentMs: 70_000 },
    });
  });
});

describe("buildLeaderboard", () => {
  it("ranks only submitted first strict public mocks with clear integrity", () => {
    const candidates = [
      candidate({ id: "eligible", displayName: "Eligible student" }),
      candidate({
        id: "later",
        displayName: "Later attempt",
        overrides: { attemptNumber: 2 },
      }),
      candidate({
        id: "private",
        displayName: "Private student",
        overrides: { visibility: "private" },
      }),
      candidate({
        id: "flagged",
        displayName: "Flagged student",
        overrides: { integrityStatus: "flagged" },
      }),
      candidate({
        id: "practice",
        displayName: "Practice student",
        overrides: { mode: "practice", strict: false },
      }),
    ];

    const leaderboard = buildLeaderboard(candidates);

    expect(leaderboard.eligibleAttemptCount).toBe(1);
    expect(leaderboard.entries.map((entry) => entry.displayName)).toEqual([
      "Eligible student",
    ]);
  });

  it("keeps an eligible student anonymous without exposing identity fields", () => {
    const leaderboard = buildLeaderboard([
      candidate({
        id: "hidden",
        displayName: "Aarav Mehta",
        hideDisplayName: true,
      }),
    ]);

    expect(leaderboard.entries[0]).toMatchObject({
      displayName: "Anonymous aspirant",
      anonymous: true,
    });
    expect(leaderboard.entries[0]).not.toHaveProperty("userId");
    expect(JSON.stringify(leaderboard.entries[0])).not.toContain("Aarav Mehta");
  });

  it("keeps percentile provisional at 99 eligible attempts and publishes it at 100", () => {
    const candidates = Array.from({ length: 100 }, (_, index) =>
      candidate({
        id: "candidate-" + index,
        displayName: "Student " + index,
        timeSpentMs: 20_000 + index,
      }),
    );

    const provisional = buildLeaderboard(candidates.slice(0, 99));
    const available = buildLeaderboard(candidates);

    expect(provisional.percentileStatus).toBe("provisional");
    expect(provisional.entries[0].percentile).toBeUndefined();
    expect(available.percentileStatus).toBe("available");
    expect(available.entries[0].percentile).toBe(100);
  });

  it("breaks equal-score ties by lower time and then earlier submission", () => {
    const leaderboard = buildLeaderboard([
      candidate({
        id: "later",
        displayName: "Later finisher",
        timeSpentMs: 10_000,
        submittedAt: "2026-10-28T11:02:00.000Z",
      }),
      candidate({
        id: "fast",
        displayName: "Fastest",
        timeSpentMs: 8_000,
        submittedAt: "2026-10-28T11:03:00.000Z",
      }),
      candidate({
        id: "early",
        displayName: "Earlier finisher",
        timeSpentMs: 10_000,
        submittedAt: "2026-10-28T11:01:00.000Z",
      }),
    ]);

    expect(leaderboard.entries.map((entry) => entry.displayName)).toEqual([
      "Fastest",
      "Earlier finisher",
      "Later finisher",
    ]);
    expect(leaderboard.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });
});

describe("database-backed dashboard mapping", () => {
  it("reconstructs timed history, persisted privacy, and the current leaderboard row", () => {
    const version = paper();
    const submittedAt = "2026-10-28T11:30:00.000Z";
    const attempt = AttemptSchema.parse({
      id: "attempt-dashboard",
      userId: "student-dashboard",
      paperVersionId: version.id,
      mode: "mock",
      strict: true,
      attemptNumber: 1,
      visibility: "public",
      integrityStatus: "clear",
      startedAt: "2026-10-28T10:00:00.000Z",
      deadlineAt: "2026-10-28T13:00:00.000Z",
      submittedAt,
      answers: [
        {
          questionId: "p1",
          selectedOptionId: "A",
          answeredAt: "2026-10-28T10:01:00.000Z",
          timeSpentMs: 42_000,
        },
      ],
    });
    const result = scoreAttempt(version, attempt);
    const buildDashboardDataFromRows = (
      analyticsModule as typeof analyticsModule & {
        buildDashboardDataFromRows: (input: Record<string, unknown>) => {
          currentAttempt: { attempt: Attempt };
          history: Array<{ attempt: Attempt }>;
          initialHideName: boolean;
          eligibleAttemptCount: number;
          leaderboard: { entries: Array<{ currentUser: boolean }> };
        };
      }
    ).buildDashboardDataFromRows;

    const dashboard = buildDashboardDataFromRows({
      userId: "student-dashboard",
      profile: { hide_display_name: true },
      attemptRows: [
        {
          id: attempt.id,
          user_id: attempt.userId,
          paper_version_id: attempt.paperVersionId,
          mode: attempt.mode,
          strict: attempt.strict,
          attempt_number: attempt.attemptNumber,
          visibility: attempt.visibility,
          integrity_status: attempt.integrityStatus,
          started_at: "2026-10-28T10:00:00+00:00",
          deadline_at: "2026-10-28T13:00:00+00:00",
          submitted_at: "2026-10-28T11:30:00+00:00",
        },
      ],
      resultRows: [{ attempt_id: attempt.id, result }],
      paperRows: [{ id: version.id, content: version }],
      eventRows: [
        {
          attempt_id: attempt.id,
          id: "answer-1",
          question_id: "p1",
          event_type: "answer_selected",
          selected_option_id: "A",
          occurred_at_ms: Date.parse("2026-10-28T10:01:00.000Z"),
          client_sequence: 1,
          time_spent_ms: 42_000,
        },
      ],
      leaderboardRows: [
        {
          rank: 1,
          display_name: "Anonymous aspirant",
          score: result.score,
          max_score: result.maxScore,
          correct: result.correct,
          incorrect: result.incorrect,
          total_time_ms: 42_000,
          submitted_at: "2026-10-28T11:30:00+00:00",
          percentile: null,
        },
      ],
    });

    expect(dashboard).toBeDefined();
    if (!dashboard) throw new Error("Expected a populated dashboard.");
    expect(dashboard.initialHideName).toBe(true);
    expect(dashboard.history).toHaveLength(1);
    expect(dashboard.currentAttempt.attempt.startedAt).toBe(
      "2026-10-28T10:00:00.000Z",
    );
    expect(dashboard.currentAttempt.attempt.submittedAt).toBe(submittedAt);
    expect(dashboard.currentAttempt.attempt.answers[0].timeSpentMs).toBe(42_000);
    expect(dashboard.eligibleAttemptCount).toBe(1);
    expect(dashboard.leaderboard.entries[0].currentUser).toBe(true);
  });
});
