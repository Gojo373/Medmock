import { ArrowRight, BookOpenCheck, Clock3, Languages } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

export default async function PaperDetailsPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;
  if (paperId !== sampleExamPaper.paperId) notFound();

  return (
    <main className="status-page">
      <Link aria-label="MedMock home" href="/"><BrandMark /></Link>
      <section className="status-card">
        <p className="eyebrow">Reviewed paper</p>
        <h1>{sampleExamPaper.title.en}</h1>
        <p>
          <Clock3 aria-hidden="true" size={16} /> {sampleExamPaper.durationMinutes} minutes ·{" "}
          <BookOpenCheck aria-hidden="true" size={16} /> {sampleExamPaper.questions.length} demo questions ·{" "}
          <Languages aria-hidden="true" size={16} /> English / हिन्दी
        </p>
        <div>
          <Link className="button button--primary" href={`/papers/${paperId}/mock`}>
            Start strict mock <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="button button--secondary" href={`/papers/${paperId}/practice`}>
            Practice with solutions
          </Link>
        </div>
      </section>
    </main>
  );
}
