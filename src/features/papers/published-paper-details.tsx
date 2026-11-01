"use client";

import { ArrowRight, BookOpenCheck, Clock3, Languages } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import type { PaperVersion } from "@/features/exam/domain";
import { localizedContent } from "@/features/localization/localized-content";
import { useLocale } from "@/features/localization/locale-provider";

type PaperDetailSummary = Pick<PaperVersion, "id" | "paperId" | "title" | "durationMinutes"> & { questionCount: number; isBilingual: boolean };

export function PublishedPaperDetails({ paper }: { paper: PaperDetailSummary }) {
  const { locale, toggleLocale, copy } = useLocale();
  const versionQuery = `?version=${encodeURIComponent(paper.id)}`;
  return (
    <main className="status-page">
      <Link aria-label={locale === "hi" ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/"><BrandMark /></Link>
      <Button onClick={toggleLocale} tone="ghost">{copy.languageSwitch}</Button>
      <section className="status-card">
        <p className="eyebrow">{locale === "hi" ? "समीक्षित पेपर" : "Reviewed paper"}</p>
        <h1>{localizedContent(paper.title, locale)}</h1>
        <p>
          <Clock3 aria-hidden="true" size={16} /> {paper.durationMinutes} {locale === "hi" ? "मिनट" : "minutes"} ·{" "}
          <BookOpenCheck aria-hidden="true" size={16} /> {paper.questionCount} {locale === "hi" ? "प्रश्न" : "questions"} ·{" "}
          <Languages aria-hidden="true" size={16} /> {paper.isBilingual ? copy.library.bilingual : copy.library.englishOnly}
        </p>
        <div>
          <Link className="button button--primary" href={`/papers/${paper.paperId}/mock${versionQuery}`}>
            {locale === "hi" ? "सख्त मॉक शुरू करें" : "Start strict mock"} <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="button button--secondary" href={`/papers/${paper.paperId}/practice${versionQuery}`}>
            {locale === "hi" ? "समाधान के साथ अभ्यास करें" : "Practice with solutions"}
          </Link>
        </div>
      </section>
    </main>
  );
}
