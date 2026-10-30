"use client";

import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronRight,
  Cloud,
  FileCheck2,
  Menu,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useLocale } from "@/features/localization/locale-provider";
import { PaperCard } from "@/features/papers/paper-card";
import { samplePapers } from "@/features/papers/sample-papers";
import type { PaperSummary } from "@/features/papers/sample-papers";

export function LandingPage({ papers = samplePapers }: { papers?: PaperSummary[] }) {
  const { copy, locale, toggleLocale } = useLocale();

  return (
    <main className="site-shell">
      <div aria-hidden="true" className="aurora aurora--one" />
      <div aria-hidden="true" className="aurora aurora--two" />
      <div aria-hidden="true" className="grid-noise" />

      <header className="site-header">
        <Link aria-label="MedMock home" href="/">
          <BrandMark compact />
        </Link>
        <nav aria-label={copy.navigation.aria} className="site-nav">
          <a href="#papers">{copy.navigation.papers}</a>
          <a href="#workflow">{copy.navigation.howItWorks}</a>
          <a href="/dashboard">{copy.navigation.analytics}</a>
        </nav>
        <div className="site-header__actions">
          <Button className="language-button" onClick={toggleLocale} tone="ghost">
            {copy.languageSwitch}
          </Button>
          <ThemeToggle />
          <a className="sign-in-link" href="/sign-in">{copy.navigation.signIn}</a>
          <Button aria-label={copy.navigation.open} className="menu-button" tone="ghost">
            <Menu aria-hidden="true" size={20} />
          </Button>
        </div>
      </header>

      <section className="hero">
        <div className="hero__content">
          <div className="eyebrow-pill">
            <Sparkles aria-hidden="true" size={15} />
            {copy.hero.eyebrow}
          </div>
          <h1>MedMock</h1>
          <p className="hero__tagline">{copy.hero.tagline}</p>
          <h2>{copy.hero.title}</h2>
          <p className="hero__description">{copy.hero.description}</p>
          <div className="hero__actions">
            <a className="button button--primary" href="#papers">
              {copy.hero.primaryCta}
              <ArrowRight aria-hidden="true" size={18} />
            </a>
            <a className="button button--secondary" href="#workflow">
              {copy.hero.secondaryCta}
              <ChevronRight aria-hidden="true" size={18} />
            </a>
          </div>
          <div className="trust-line">
            <span className="trust-avatars" aria-hidden="true">
              <i>Bi</i><i>Ch</i><i>Ph</i>
            </span>
            <span><ShieldCheck aria-hidden="true" size={17} /> {copy.hero.trusted}</span>
          </div>
          <div className="metrics-row">
            <div><strong>24+</strong><span>{copy.metrics.papers}</span></div>
            <div><strong>4.3k</strong><span>{copy.metrics.questions}</span></div>
            <div><strong>100%</strong><span>{copy.metrics.reliability}</span></div>
          </div>
        </div>

        <GlassPanel className="exam-preview">
          <div className="exam-preview__glow" />
          <div className="exam-preview__header">
            <div>
              <span className="status-dot" />
              {copy.preview.label}
            </div>
            <span className="exam-preview__timer">{copy.preview.time}</span>
          </div>
          <div className="exam-preview__subjects">
            <span className="is-active">{copy.preview.subject}</span>
            <span>{locale === "en" ? "Chemistry" : "रसायन विज्ञान"}</span>
            <span>{locale === "en" ? "Biology" : "जीव विज्ञान"}</span>
          </div>
          <div className="exam-preview__body">
            <div className="exam-preview__question">
              <div className="question-number">{copy.preview.question}</div>
              <p>{copy.preview.prompt}</p>
              <div className="preview-options">
                {["A", "B", "C", "D"].map((option, index) => (
                  <div className={index === 1 ? "is-selected" : ""} key={option}>
                    <span>{option}</span>
                    <i className={`mini-chart mini-chart--${index + 1}`} />
                    {index === 1 && <Check aria-hidden="true" size={16} />}
                  </div>
                ))}
              </div>
            </div>
            <aside className="question-palette" aria-label="Question palette preview">
              <div className="palette-summary"><span>45</span><small>{locale === "en" ? "Questions" : "प्रश्न"}</small></div>
              <div className="palette-grid">
                {Array.from({ length: 20 }, (_, index) => (
                  <span
                    className={index === 17 ? "is-current" : index < 8 ? "is-answered" : index === 11 ? "is-review" : ""}
                    key={index}
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
            </aside>
          </div>
          <div className="exam-preview__footer">
            <span><Cloud aria-hidden="true" size={15} /> {locale === "en" ? "Saved just now" : "अभी सेव हुआ"}</span>
            <Button>{copy.preview.save}<ArrowRight aria-hidden="true" size={16} /></Button>
          </div>
        </GlassPanel>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading">
          <p className="eyebrow">{copy.workflow.kicker}</p>
          <h2>{copy.workflow.title}</h2>
        </div>
        <div className="workflow-grid">
          <FeatureCard
            icon={<FileCheck2 aria-hidden="true" />}
            number="01"
            text={copy.workflow.uploadText}
            title={copy.workflow.uploadTitle}
          />
          <FeatureCard
            icon={<TimerReset aria-hidden="true" />}
            number="02"
            text={copy.workflow.examText}
            title={copy.workflow.examTitle}
          />
          <FeatureCard
            icon={<BrainCircuit aria-hidden="true" />}
            number="03"
            text={copy.workflow.insightText}
            title={copy.workflow.insightTitle}
          />
        </div>
      </section>

      <section className="paper-section" id="papers">
        <div className="paper-section__heading">
          <div>
            <p className="eyebrow">{copy.library.kicker}</p>
            <h2>{copy.library.title}</h2>
          </div>
          <p>{copy.library.description}</p>
        </div>
        <div className="paper-grid">
          {papers.map((paper) => (
            <PaperCard key={`${paper.id}:${paper.versionId ?? "sample"}`} paper={paper} />
          ))}
        </div>
      </section>

      <section className="insight-banner">
        <div>
          <BarChart3 aria-hidden="true" />
          <div>
            <p className="eyebrow">{locale === "en" ? "After every attempt" : "हर प्रयास के बाद"}</p>
            <h2>{locale === "en" ? "Know exactly what to improve next." : "जानें कि आगे क्या सुधारना है।"}</h2>
          </div>
        </div>
        <div className="insight-chips">
          <span>+4 / -1</span>
          <span>{locale === "en" ? "Topic accuracy" : "टॉपिक सटीकता"}</span>
          <span>{locale === "en" ? "Time per question" : "प्रति प्रश्न समय"}</span>
          <span>{locale === "en" ? "First-attempt rank" : "पहले प्रयास की रैंक"}</span>
        </div>
      </section>

      <footer className="site-footer">
        <BrandMark compact />
        <div>
          <p>{copy.footer.note}</p>
          <p>{copy.footer.rights}</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  number,
  text,
  title,
}: {
  icon: React.ReactNode;
  number: string;
  text: string;
  title: string;
}) {
  return (
    <GlassPanel className="feature-card">
      <div className="feature-card__top">
        <span className="feature-card__icon">{icon}</span>
        <span>{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </GlassPanel>
  );
}
