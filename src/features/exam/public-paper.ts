import type { PaperVersion } from "@/features/exam/domain";

export function redactPaperForStrictMock(paper: PaperVersion): PaperVersion {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      ...question,
      acceptedOptionIds: [],
      disposition: "dropped" as const,
      solution: undefined,
    })),
  };
}
