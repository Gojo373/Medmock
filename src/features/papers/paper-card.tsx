import { ArrowUpRight, CheckCircle2, Clock3, Languages, ListChecks, Users } from "lucide-react";

import type { PaperSummary } from "@/features/papers/sample-papers";
import { useLocale } from "@/features/localization/locale-provider";
import { cn } from "@/lib/cn";

export function PaperCard({ paper }: { paper: PaperSummary }) {
  const { copy, locale } = useLocale();
  const href = `/papers/${paper.id}${
    paper.versionId ? `?version=${encodeURIComponent(paper.versionId)}` : ""
  }`;
  const publishedDate = new Intl.DateTimeFormat(
    locale === "en" ? "en-IN" : "hi-IN",
    { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" },
  ).format(new Date(paper.publishedAt));

  return (
    <article className={cn("paper-card", paper.gradient)}>
      <div className="paper-card__topline">
        <span><CheckCircle2 aria-hidden="true" size={15} /> {copy.library.reviewed}</span>
        <span>{publishedDate}</span>
      </div>
      <div>
        <p className="paper-card__code">{paper.id.toUpperCase()}</p>
        <h3>{paper.title[locale]}</h3>
      </div>
      <div className="paper-card__meta">
        <span><ListChecks aria-hidden="true" size={16} /> {paper.questions} {copy.library.questions}</span>
        <span><Clock3 aria-hidden="true" size={16} /> {paper.minutes} {copy.library.minutes}</span>
        <span><Languages aria-hidden="true" size={16} /> {copy.library.bilingual}</span>
        <span><Users aria-hidden="true" size={16} /> {paper.attempts}</span>
      </div>
      <a className="paper-card__link" href={href}>
        {copy.library.start}
        <ArrowUpRight aria-hidden="true" size={17} />
      </a>
    </article>
  );
}
