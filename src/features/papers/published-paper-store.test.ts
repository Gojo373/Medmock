import { describe, expect, it } from "vitest";

import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import {
  buildPublishedPaperLibrary,
  selectPublishedPaperVersion,
} from "@/features/papers/server/published-paper-store";

function publishedVersion(
  id: string,
  pattern: "original" | "current",
  revision: number,
) {
  return {
    ...sampleExamPaper,
    id,
    paperId: "neet-reviewed",
    pattern,
    revision,
    title: {
      en: `Reviewed NEET ${pattern} pattern`,
      hi: `समीक्षित नीट ${pattern === "current" ? "वर्तमान" : "मूल"} पैटर्न`,
    },
  };
}

describe("published paper store", () => {
  it("maps published original and current versions into selectable library entries", () => {
    const original = publishedVersion("neet-reviewed-original-v1", "original", 1);
    const current = publishedVersion("neet-reviewed-current-v2", "current", 2);
    const rows = [
      {
        id: original.id,
        paper_id: original.paperId,
        status: "published",
        content: original,
        published_at: "2026-10-28T10:00:00+00:00",
      },
      {
        id: current.id,
        paper_id: current.paperId,
        status: "published",
        content: current,
        published_at: "2026-10-29T10:00:00+00:00",
      },
    ];

    expect(buildPublishedPaperLibrary(rows)).toEqual([
      expect.objectContaining({
        id: "neet-reviewed",
        versionId: "neet-reviewed-current-v2",
        pattern: "current",
        publishedAt: "2026-10-29T10:00:00.000Z",
      }),
      expect.objectContaining({
        id: "neet-reviewed",
        versionId: "neet-reviewed-original-v1",
        pattern: "original",
        publishedAt: "2026-10-28T10:00:00.000Z",
      }),
    ]);
    expect(
      selectPublishedPaperVersion(rows, "neet-reviewed", current.id),
    ).toEqual(current);
    expect(selectPublishedPaperVersion(rows, "neet-reviewed")).toEqual(current);
  });

  it("marks an English-only published paper without a bilingual claim", () => {
    const englishOnly = structuredClone(
      publishedVersion("neet-english-current-v1", "current", 1),
    );
    delete (englishOnly.title as { hi?: string }).hi;
    for (const section of englishOnly.sections) delete (section.title as { hi?: string }).hi;
    for (const question of englishOnly.questions) {
      delete (question.stem as { hi?: string }).hi;
      if (question.solution) delete (question.solution as { hi?: string }).hi;
      for (const option of question.options) delete (option.text as { hi?: string }).hi;
    }

    expect(buildPublishedPaperLibrary([{
      id: englishOnly.id,
      paper_id: englishOnly.paperId,
      status: "published",
      content: englishOnly,
      published_at: "2026-11-01T00:00:00+00:00",
    }])).toEqual([
      expect.objectContaining({ isBilingual: false }),
    ]);
  });
});
