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
});
