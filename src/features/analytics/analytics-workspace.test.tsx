import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  AnalyticsShell,
  type AttemptHistoryItem,
} from "@/features/analytics/analytics-workspace";
import { buildLeaderboard } from "@/features/analytics/analytics";
import { AttemptSchema, type Attempt } from "@/features/exam/domain";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { scoreAttempt } from "@/features/exam/scoring";

function attempt({
  id = "attempt-current",
  userId = "student-current",
  visibility = "public",
  submittedAt = "2026-10-28T12:00:00.000Z",
  answers,
}: {
  id?: string;
  userId?: string;
  visibility?: "public" | "private";
  submittedAt?: string;
  answers?: Attempt["answers"];
} = {}) {
  return AttemptSchema.parse({
    id,
    userId,
    paperVersionId: sampleExamPaper.id,
    mode: "mock",
    strict: true,
    attemptNumber: 1,
    visibility,
    integrityStatus: "clear",
    startedAt: "2026-10-28T09:00:00.000Z",
    deadlineAt: "2026-10-28T12:00:00.000Z",
    submittedAt,
    answers: answers ?? [
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
    ],
  });
}

function historyItem(currentAttempt: Attempt): AttemptHistoryItem {
  return {
    paper: sampleExamPaper,
    attempt: currentAttempt,
    result: scoreAttempt(sampleExamPaper, currentAttempt),
  };
}

function renderWorkspace() {
  const currentAttempt = attempt();
  const rivalAttempt = attempt({
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
    ],
  });
  const leaderboard = buildLeaderboard([
    {
      displayName: "You",
      hideDisplayName: false,
      isCurrentUser: true,
      attempt: currentAttempt,
      result: scoreAttempt(sampleExamPaper, currentAttempt),
    },
    {
      displayName: "Riya Sharma",
      hideDisplayName: false,
      attempt: rivalAttempt,
      result: scoreAttempt(sampleExamPaper, rivalAttempt),
    },
  ]);

  render(
    <AnalyticsShell
      currentAttempt={historyItem(currentAttempt)}
      eligibleAttemptCount={64}
      history={[historyItem(currentAttempt)]}
      leaderboard={leaderboard}
    />,
  );
}

describe("AnalyticsShell", () => {
  it("summarizes a reviewed result and keeps percentile provisional", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Attempt analysis" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Attempt summary" })).getByText("7 / 24"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Percentile unlocks after 100 eligible first attempts"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subject performance" })).toBeInTheDocument();
    expect(screen.getByText("Modern Physics")).toBeInTheDocument();
  });

  it("reviews the selected answer, accepted answer, and reviewed solution", () => {
    renderWorkspace();

    const question = screen.getByRole("heading", {
      name: "The energy of a photon is directly proportional to which quantity?",
    }).closest("article")!;
    expect(within(question).getByText("Your answer: A")).toBeInTheDocument();
    expect(within(question).getByText("Correct answer: B")).toBeInTheDocument();
    expect(within(question).getByText("Planck's relation is E = hν.")).toBeInTheDocument();
  });

  it("shows attempt history and updates the local leaderboard privacy control", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const history = screen.getByRole("heading", { name: "Attempt history" }).closest("section")!;
    expect(within(history).getByText("NEET 2025 · Full syllabus mock")).toBeInTheDocument();
    expect(screen.getByText("Riya Sharma")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: "Hide my name on public rankings" }),
    );

    const currentRow = screen.getByRole("row", { name: /Anonymous aspirant/ });
    expect(currentRow).toHaveTextContent("Anonymous aspirant");
    expect(currentRow).not.toHaveTextContent("You");
  });
});
