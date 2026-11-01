import type { PaperVersion } from "@/features/exam/domain";
import type { Locale } from "@/features/localization/messages";

type LocalizedContent = {
  en: string;
  hi?: string;
};

export function localizedContent(value: LocalizedContent, locale: Locale) {
  return locale === "hi" ? value.hi ?? value.en : value.en;
}

function hasHindi(value: LocalizedContent) {
  return Boolean(value.hi?.trim());
}

export function isPaperBilingual(paper: PaperVersion) {
  return hasHindi(paper.title) &&
    paper.sections.every((section) => hasHindi(section.title)) &&
    paper.questions.every((question) =>
      hasHindi(question.stem) &&
      question.options.every((option) => hasHindi(option.text)) &&
      (!question.solution || hasHindi(question.solution)),
    );
}
