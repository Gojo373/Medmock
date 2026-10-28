import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PaperVersionSchema, type PaperVersion } from "@/features/exam/domain";
import { ExamWorkspace } from "@/features/exam/exam-workspace";

function localized(en: string, hi = en + " हिंदी") {
  return { en, hi };
}

function fixture(): PaperVersion {
  return PaperVersionSchema.parse({
    schemaVersion: 1,
    id: "version-ui",
    paperId: "paper-ui",
    revision: 1,
    status: "published",
    title: localized("NEET 2025 full mock"),
    durationMinutes: 180,
    publishedAt: "2026-10-28T10:00:00.000Z",
    sections: [
      {
        id: "physics",
        subject: "physics",
        title: localized("Physics"),
        questionIds: ["p1"],
      },
    ],
    questions: [
      {
        id: "p1",
        sectionId: "physics",
        subject: "physics",
        topic: "Mechanics",
        stem: localized("What is force?"),
        options: [
          { id: "A", text: localized("Mass times acceleration") },
          { id: "B", text: localized("Mass divided by acceleration") },
        ],
        acceptedOptionIds: ["A"],
        solution: localized("Use Newton's second law."),
        disposition: "standard",
        marking: { correct: 4, incorrect: -1, unattempted: 0 },
      },
    ],
  });
}

describe("ExamWorkspace", () => {
  it("conceals correctness while a mock attempt is active", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="mock" paper={fixture()} />);

    await user.click(
      screen.getByRole("button", { name: "A. Mass times acceleration" }),
    );

    expect(
      screen.getByRole("button", { name: "A. Mass times acceleration" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Correct answer: A")).not.toBeInTheDocument();
  });

  it("reveals the reviewed answer and locks a practice choice", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="practice" paper={fixture()} />);

    const wrongOption = screen.getByRole("button", {
      name: "B. Mass divided by acceleration",
    });
    await user.click(wrongOption);
    await user.click(
      screen.getByRole("button", { name: "A. Mass times acceleration" }),
    );

    expect(screen.getByText("Not quite")).toBeInTheDocument();
    expect(screen.getByText("Correct answer: A")).toBeInTheDocument();
    expect(wrongOption).toHaveAttribute("aria-pressed", "true");
  });

  it("opens a confirmation dialog before manual submission", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="mock" paper={fixture()} />);

    await user.click(screen.getByRole("button", { name: "Submit test" }));

    expect(
      screen.getByRole("heading", { name: "Submit this attempt?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm submission" })).toBeInTheDocument();
  });
});
