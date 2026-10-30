import "server-only";

import { PaperVersionSchema, type PaperVersion } from "@/features/exam/domain";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import {
  samplePapers,
  type PaperSummary,
} from "@/features/papers/sample-papers";
import { normalizeDatabaseTimestamp } from "@/lib/database-timestamps";
import {
  createSupabasePublicClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

type PublishedPaperRow = {
  id: unknown;
  paper_id: unknown;
  status: unknown;
  content: unknown;
  published_at: unknown;
};

function parsePublishedPaperRow(row: PublishedPaperRow): PaperVersion {
  const content =
    typeof row.content === "object" && row.content !== null ? row.content : {};
  const contentPublishedAt = (content as Record<string, unknown>).publishedAt;

  return PaperVersionSchema.parse({
    ...content,
    id: row.id,
    paperId: row.paper_id,
    status: "published",
    publishedAt: normalizeDatabaseTimestamp(
      contentPublishedAt ?? row.published_at,
    ),
  });
}

function publishedRecords(rows: PublishedPaperRow[]) {
  return rows
    .filter((row) => row.status === "published")
    .map((row) => ({
      paper: parsePublishedPaperRow(row),
      publishedAt: normalizeDatabaseTimestamp(row.published_at),
    }));
}

export function buildPublishedPaperLibrary(
  rows: PublishedPaperRow[],
): PaperSummary[] {
  return publishedRecords(rows)
    .sort(
      (left, right) =>
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        right.paper.revision - left.paper.revision ||
        right.paper.id.localeCompare(left.paper.id),
    )
    .map(({ paper, publishedAt }, index) => ({
      id: paper.paperId,
      versionId: paper.id,
      pattern: paper.pattern,
      title: paper.title,
      publishedAt,
      questions: paper.questions.length,
      minutes: paper.durationMinutes,
      attempts: "New",
      gradient: [
        "paper-card--cyan",
        "paper-card--violet",
        "paper-card--mint",
      ][index % 3],
    }));
}

export function selectPublishedPaperVersion(
  rows: PublishedPaperRow[],
  paperId: string,
  versionId?: string,
) {
  const versions = publishedRecords(rows)
    .map(({ paper }) => paper)
    .filter((paper) => paper.paperId === paperId);

  if (versionId) {
    return versions.find((paper) => paper.id === versionId);
  }

  return versions.sort(
    (left, right) =>
      Number(right.pattern === "current") -
        Number(left.pattern === "current") ||
      right.revision - left.revision ||
      Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""),
  )[0];
}

async function loadPublishedRows(paperId?: string) {
  const client = createSupabasePublicClient();
  let query = client
    .from("paper_versions")
    .select("id, paper_id, status, content, published_at")
    .eq("status", "published");

  if (paperId) query = query.eq("paper_id", paperId);

  const { data, error } = await query.order("published_at", {
    ascending: false,
  });

  if (error) throw error;
  return (data ?? []) as PublishedPaperRow[];
}

export async function loadPublishedPaperLibrary() {
  if (!hasSupabaseServerConfig()) return samplePapers;
  return buildPublishedPaperLibrary(await loadPublishedRows());
}

export async function loadPublishedPaperVersion(
  paperId: string,
  versionId?: string,
) {
  if (!hasSupabaseServerConfig()) {
    return paperId === sampleExamPaper.paperId &&
      (!versionId || versionId === sampleExamPaper.id)
      ? sampleExamPaper
      : undefined;
  }

  return selectPublishedPaperVersion(
    await loadPublishedRows(paperId),
    paperId,
    versionId,
  );
}
