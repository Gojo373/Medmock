import { ArrowRight, BookOpenCheck, Clock3, Languages } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
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
  const versionQuery = `?version=${encodeURIComponent(paper.id)}`;

  return (
    <main className="status-page">
      <Link aria-label="MedMock home" href="/"><BrandMark /></Link>
      <section className="status-card">
        <p className="eyebrow">Reviewed paper</p>
        <h1>{paper.title.en}</h1>
        <p>
          <Clock3 aria-hidden="true" size={16} /> {paper.durationMinutes} minutes ·{" "}
          <BookOpenCheck aria-hidden="true" size={16} /> {paper.questions.length} questions ·{" "}
          <Languages aria-hidden="true" size={16} /> English / हिन्दी
        </p>
        <div>
          <Link className="button button--primary" href={`/papers/${paperId}/mock${versionQuery}`}>
            Start strict mock <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="button button--secondary" href={`/papers/${paperId}/practice${versionQuery}`}>
            Practice with solutions
          </Link>
        </div>
      </section>
    </main>
  );
}
