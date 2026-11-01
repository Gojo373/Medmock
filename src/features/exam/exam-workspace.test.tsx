import { screen } from "@testing-library/react";
import { render } from "@/test/render";
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

function englishOnlyFixture(): PaperVersion {
  const paper = structuredClone(fixture());
  delete paper.title.hi;
  for (const section of paper.sections) delete section.title.hi;
  for (const question of paper.questions) {
    delete question.stem.hi;
    if (question.solution) delete question.solution.hi;
    for (const option of question.options) delete option.text.hi;
  }
  return PaperVersionSchema.parse(paper);
}

describe("ExamWorkspace", () => {
  it("conceals correctness while a mock attempt is active", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="mock" paper={fixture()} userId="student-ui" />);

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
    render(<ExamWorkspace mode="practice" paper={fixture()} userId="student-ui" />);

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
    render(<ExamWorkspace mode="mock" paper={fixture()} userId="student-ui" />);

    await user.click(screen.getByRole("button", { name: "Submit test" }));

    expect(
      screen.getByRole("heading", { name: "Submit this attempt?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm submission" })).toBeInTheDocument();
  });

  it("localizes exam controls, timer, palette, sync state, and submission dialog in Hindi", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="mock" paper={fixture()} userId="student-ui" />);

    await user.click(screen.getByRole("button", { name: "Switch question language" }));

    expect(screen.getByText("समय शेष")).toBeInTheDocument();
    expect(screen.getByText("प्रश्न 1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "टेस्ट जमा करें" })).toBeInTheDocument();
    expect(screen.getByText("इस डिवाइस पर सहेजा गया")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "टेस्ट जमा करें" }));
    expect(
      screen.getByRole("heading", { name: "यह प्रयास जमा करें?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "जमा करने की पुष्टि करें" })).toBeInTheDocument();
  });

  it("falls back to English question content under Hindi controls", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="practice" paper={englishOnlyFixture()} userId="student-ui" />);

    await user.click(screen.getByRole("button", { name: "Switch question language" }));

    expect(screen.getByText("समय शेष")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What is force?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A. Mass times acceleration" })).toBeInTheDocument();
  });

  it("traps dialog focus, makes the background inert, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<ExamWorkspace mode="mock" paper={fixture()} userId="student-ui" />);

    const submit = screen.getByRole("button", { name: "Submit test" });
    await user.click(submit);

    const background = screen.getByTestId("exam-background");
    const confirm = screen.getByRole("button", { name: "Confirm submission" });
    const cancel = screen.getByRole("button", { name: "Keep reviewing" });
    expect(background).toHaveAttribute("inert");
    expect(confirm).toHaveFocus();

    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(background).not.toHaveAttribute("inert");
    expect(submit).toHaveFocus();
  });
});
