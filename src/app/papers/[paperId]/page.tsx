import { notFound } from "next/navigation";

import { PublishedPaperDetails } from "@/features/papers/published-paper-details";
import { loadPublishedPaperVersion } from "@/features/papers/server/published-paper-store";

export default async function PaperDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ paperId: string }>;
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const { paperId } = await params;
  const version = (await searchParams).version;
  if (Array.isArray(version)) notFound();
  const paper = await loadPublishedPaperVersion(paperId, version);
  if (!paper) notFound();
  return <PublishedPaperDetails paper={{
    id: paper.id,
    paperId: paper.paperId,
    title: paper.title,
    durationMinutes: paper.durationMinutes,
    questionCount: paper.questions.length,
  }} />;
}
