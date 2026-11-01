import { describe, expect, it } from "vitest";

import { PaperVersionSchema } from "@/features/exam/domain";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import {
  isPaperBilingual,
  localizedContent,
} from "@/features/localization/localized-content";

function englishOnlyPaper() {
  const paper = structuredClone(sampleExamPaper);
  delete (paper.title as { hi?: string }).hi;
  for (const section of paper.sections) {
    delete (section.title as { hi?: string }).hi;
  }
  for (const question of paper.questions) {
    delete (question.stem as { hi?: string }).hi;
    if (question.solution) delete (question.solution as { hi?: string }).hi;
    for (const option of question.options) {
      delete (option.text as { hi?: string }).hi;
    }
  }
  return paper;
}

describe("optional Hindi paper content", () => {
  it("accepts a complete English-only published paper", () => {
    expect(PaperVersionSchema.parse(englishOnlyPaper())).toMatchObject({
      title: { en: sampleExamPaper.title.en },
    });
  });

  it("keeps English content mandatory", () => {
    const paper = structuredClone(sampleExamPaper);
    delete (paper.questions[0].stem as { en?: string }).en;

    expect(() => PaperVersionSchema.parse(paper)).toThrow();
  });

  it("falls back to English when Hindi content is unavailable", () => {
    expect(localizedContent({ en: "Force" }, "hi")).toBe("Force");
  });

  it("reports bilingual support only when every localized field has Hindi", () => {
    expect(isPaperBilingual(sampleExamPaper)).toBe(true);
    expect(isPaperBilingual(englishOnlyPaper())).toBe(false);
  });
});
