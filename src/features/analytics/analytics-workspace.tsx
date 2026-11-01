"use client";

import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Languages,
  LockKeyhole,
  Medal,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/features/localization/locale-provider";
import {
  buildPerformanceAnalytics,
  type LeaderboardSnapshot,
} from "@/features/analytics/analytics";
import type {
  Attempt,
  AttemptResult,
  PaperVersion,
  Subject,
} from "@/features/exam/domain";

export type AttemptHistoryItem = {
  paper: PaperVersion;
  attempt: Attempt;
  result: AttemptResult;
};

type Locale = "en" | "hi";

const copy = {
  en: {
    analysis: "Attempt analysis",
    back: "Paper library",
    dashboard: "Dashboard",
    score: "Score",
    accuracy: "Accuracy",
    attempted: "Attempted",
    averagePace: "Average pace",
    percentilePending: "Percentile unlocks after 100 eligible first attempts",
    percentileReady: "Percentile",
    subjectPerformance: "Subject performance",
    focusTopics: "Topics to revisit",
    solutionReview: "Solution review",
    yourAnswer: "Your answer",
    correctAnswer: "Correct answer",
    unanswered: "Not answered",
    attemptHistory: "Attempt history",
    leaderboard: "First-attempt leaderboard",
    leaderboardNote: "Only submitted first strict mocks with clear integrity are ranked.",
    privacy: "Hide my name on public rankings",
    privateNote: "Your scores stay in your private history even when public identity is hidden.",
    privacyError: "Privacy could not be updated. Your previous setting was restored.",
    rank: "Rank",
    aspirant: "Aspirant",
    marks: "Marks",
    time: "Time",
    status: "Status",
    reviewed: "Reviewed",
    anonymous: "Anonymous aspirant",
    correct: "correct",
    incorrect: "incorrect",
  },
  hi: {
    analysis: "प्रयास विश्लेषण",
    back: "पेपर लाइब्रेरी",
    dashboard: "डैशबोर्ड",
    score: "स्कोर",
    accuracy: "सटीकता",
    attempted: "प्रयास किए",
    averagePace: "औसत गति",
    percentilePending: "पर्सेंटाइल 100 योग्य पहले प्रयासों के बाद उपलब्ध होगा",
    percentileReady: "पर्सेंटाइल",
    subjectPerformance: "विषय प्रदर्शन",
    focusTopics: "दोबारा पढ़ने वाले टॉपिक",
    solutionReview: "समाधान समीक्षा",
    yourAnswer: "आपका उत्तर",
    correctAnswer: "सही उत्तर",
    unanswered: "उत्तर नहीं दिया",
    attemptHistory: "प्रयास इतिहास",
    leaderboard: "पहले प्रयास की लीडरबोर्ड",
    leaderboardNote: "केवल स्पष्ट सत्यनिष्ठा वाले पहले सख्त मॉक को रैंक किया जाता है।",
    privacy: "सार्वजनिक रैंकिंग में मेरा नाम छिपाएं",
    privateNote: "सार्वजनिक पहचान छिपाने पर भी स्कोर निजी इतिहास में सुरक्षित रहता है।",
    privacyError: "गोपनीयता अपडेट नहीं हो सकी। आपकी पिछली सेटिंग बहाल कर दी गई है।",
    rank: "रैंक",
    aspirant: "अभ्यर्थी",
    marks: "अंक",
    time: "समय",
    status: "स्थिति",
    reviewed: "समीक्षित",
    anonymous: "गुमनाम अभ्यर्थी",
    correct: "सही",
    incorrect: "गलत",
  },
} as const;

const subjectNames: Record<Locale, Record<Subject, string>> = {
  en: { physics: "Physics", chemistry: "Chemistry", biology: "Biology" },
  hi: { physics: "भौतिक विज्ञान", chemistry: "रसायन विज्ञान", biology: "जीव विज्ञान" },
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.round(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function AnalyticsEmptyState() {
  const { locale, toggleLocale } = useLocale();
  const text =
    locale === "en"
      ? {
          title: "Your results will appear here",
          description:
            "Complete a reviewed mock or practice paper to unlock history, solutions, timing analytics, and eligible rankings.",
          action: "Browse paper library",
        }
      : {
          title: "आपके परिणाम यहाँ दिखाई देंगे",
          description:
            "इतिहास, समाधान, समय विश्लेषण और योग्य रैंकिंग देखने के लिए समीक्षित मॉक या अभ्यास पेपर पूरा करें।",
          action: "पेपर लाइब्रेरी देखें",
        };

  return (
    <main className="analytics-shell">
      <header className="analytics-topbar">
        <Link aria-label={locale === "hi" ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/">
          <BrandMark compact />
        </Link>
        <div />
        <div>
          <Button
            aria-label={locale === "hi" ? "विश्लेषण की भाषा बदलें" : "Switch analytics language"}
            onClick={toggleLocale}
            tone="ghost"
          >
            <Languages aria-hidden="true" size={17} />
            {locale === "en" ? "हिंदी" : "English"}
          </Button>
          <ThemeToggle />
        </div>
      </header>
      <div className="analytics-page">
        <section className="analytics-panel analytics-empty-state">
          <BookOpenCheck aria-hidden="true" />
          <h1>{text.title}</h1>
          <p>{text.description}</p>
          <Link className="button button--primary" href="/">
            {text.action}
          </Link>
        </section>
      </div>
    </main>
  );
}

export function AnalyticsLoadingState() {
  const { locale } = useLocale();
  return (
    <main className="analytics-shell">
      <div className="analytics-page">
        <section
          aria-live="polite"
          className="analytics-panel analytics-empty-state"
          role="status"
        >
          <TrendingUp aria-hidden="true" />
          <h1>{locale === "hi" ? "आपका डैशबोर्ड लोड हो रहा है…" : "Loading your dashboard…"}</h1>
          <p>{locale === "hi" ? "आपका सुरक्षित प्रयास इतिहास लोड हो रहा है।" : "Loading your secure attempt history."}</p>
        </section>
      </div>
    </main>
  );
}

export function AnalyticsErrorState({ retry }: { retry: () => void }) {
  const { locale, toggleLocale } = useLocale();
  const text = locale === "en"
    ? {
        title: "Your dashboard could not be loaded.",
        description: "Your attempt data remains safe. Retry the database request.",
        retry: "Try again",
      }
    : {
        title: "आपका डैशबोर्ड लोड नहीं हो सका।",
        description: "आपका प्रयास डेटा सुरक्षित है। डेटाबेस अनुरोध फिर चलाएँ।",
        retry: "फिर प्रयास करें",
      };

  return (
    <main className="analytics-shell">
      <header className="analytics-topbar">
        <Link aria-label={locale === "hi" ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/">
          <BrandMark compact />
        </Link>
        <div />
        <Button
          aria-label={locale === "hi" ? "विश्लेषण की भाषा बदलें" : "Switch analytics language"}
          onClick={toggleLocale}
          tone="ghost"
        >
          <Languages aria-hidden="true" size={17} />
          {locale === "en" ? "हिंदी" : "English"}
        </Button>
      </header>
      <div className="analytics-page">
        <section className="analytics-panel analytics-empty-state" role="alert">
          <XCircle aria-hidden="true" />
          <h1>{text.title}</h1>
          <p>{text.description}</p>
          <Button onClick={retry}>{text.retry}</Button>
        </section>
      </div>
    </main>
  );
}

export function AnalyticsShell({
  currentAttempt: latestAttempt,
  eligibleAttemptCount,
  history,
  leaderboard,
  initialHideName = false,
}: {
  currentAttempt: AttemptHistoryItem;
  eligibleAttemptCount: number;
  history: AttemptHistoryItem[];
  leaderboard: LeaderboardSnapshot;
  initialHideName?: boolean;
}) {
  const { locale, toggleLocale } = useLocale();
  const [selectedAttemptId, setSelectedAttemptId] = useState(latestAttempt.attempt.id);
  const currentAttempt = history.find((item) => item.attempt.id === selectedAttemptId) ?? latestAttempt;
  const hasLoadedLeaderboard = currentAttempt.paper.id === latestAttempt.paper.id;
  const [hideName, setHideName] = useState(initialHideName);
  const [privacyState, setPrivacyState] = useState<"error" | "idle" | "saving">("idle");
  const text = copy[locale];
  const analytics = useMemo(
    () =>
      buildPerformanceAnalytics(currentAttempt.paper, currentAttempt.attempt, {
        eligibleAttemptCount: hasLoadedLeaderboard ? eligibleAttemptCount : 0,
      }),
    [currentAttempt, eligibleAttemptCount, hasLoadedLeaderboard],
  );
  const weakestTopics = [...analytics.topics]
    .filter((topic) => topic.attempted > 0)
    .sort(
      (left, right) =>
        left.accuracyPercent - right.accuracyPercent ||
        right.timeSpentMs - left.timeSpentMs,
    )
    .slice(0, 4);
  const currentRank = hasLoadedLeaderboard ? leaderboard.entries.find((entry) => entry.currentUser) : undefined;

  return (
    <main className="analytics-shell">
      <header className="analytics-topbar">
        <Link aria-label={locale === "hi" ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/">
          <BrandMark compact />
        </Link>
        <nav aria-label={locale === "hi" ? "विश्लेषण नेविगेशन" : "Analytics navigation"}>
          <a href="#analysis">{text.analysis}</a>
          <a href="#history">{text.attemptHistory}</a>
          <a href="#leaderboard">{text.leaderboard}</a>
        </nav>
        <div>
          <Button
            aria-label={locale === "hi" ? "विश्लेषण की भाषा बदलें" : "Switch analytics language"}
            onClick={toggleLocale}
            tone="ghost"
          >
            <Languages aria-hidden="true" size={17} />
            {locale === "en" ? "हिंदी" : "English"}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="analytics-page">
        <section className="analytics-hero" id="analysis">
          <div>
            <p className="eyebrow">{currentAttempt.paper.title[locale]}</p>
            <h1>{text.analysis}</h1>
            <p>
              {new Date(currentAttempt.attempt.submittedAt ?? currentAttempt.attempt.startedAt)
                .toLocaleDateString(locale === "en" ? "en-IN" : "hi-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
            </p>
          </div>
          <Link className="button button--secondary" href="/">
            {text.back}
          </Link>
        </section>

        <section
          aria-label={locale === "hi" ? "प्रयास सारांश" : "Attempt summary"}
          className="analytics-stat-grid"
          role="region"
        >
          <StatCard
            icon={<Medal aria-hidden="true" />}
            label={text.score}
            value={`${analytics.result.score} / ${analytics.result.maxScore}`}
          />
          <StatCard
            icon={<Target aria-hidden="true" />}
            label={text.accuracy}
            value={formatPercent(analytics.overall.accuracyPercent)}
          />
          <StatCard
            icon={<BookOpenCheck aria-hidden="true" />}
            label={text.attempted}
            value={`${analytics.overall.attempted} / ${currentAttempt.paper.questions.length}`}
          />
          <StatCard
            icon={<Clock3 aria-hidden="true" />}
            label={text.averagePace}
            value={formatDuration(analytics.overall.averageTimePerVisitedMs)}
          />
        </section>

        <section className="percentile-banner">
          <TrendingUp aria-hidden="true" />
          <div>
            <strong>
              {analytics.leaderboard.percentile.status === "available"
                ? `${text.percentileReady}: ${currentRank?.percentile ?? "—"}`
                : text.percentilePending}
            </strong>
            <span>{hasLoadedLeaderboard ? eligibleAttemptCount : 0} / 100 {locale === "hi" ? "योग्य प्रयास" : "eligible attempts"}</span>
          </div>
        </section>

        <div className="analytics-grid">
          <section className="analytics-panel">
            <div className="analytics-panel__heading">
              <BarChart3 aria-hidden="true" />
              <h2>{text.subjectPerformance}</h2>
            </div>
            <div className="subject-performance-list">
              {analytics.subjects
                .filter((subject) => subject.maxScore > 0)
                .map((subject) => (
                  <div key={subject.subject}>
                    <div>
                      <strong>{subjectNames[locale][subject.subject]}</strong>
                      <span>{subject.score} / {subject.maxScore}</span>
                    </div>
                    <div className="performance-track">
                      <i
                        style={{
                          width: `${Math.max(0, (subject.score / subject.maxScore) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {subject.correct} {text.correct} · {subject.incorrect} {text.incorrect} · {formatDuration(subject.timeSpentMs)}
                    </small>
                  </div>
                ))}
            </div>
          </section>

          <section className="analytics-panel">
            <div className="analytics-panel__heading">
              <Target aria-hidden="true" />
              <h2>{text.focusTopics}</h2>
            </div>
            <div className="topic-list">
              {weakestTopics.map((topic) => (
                <div key={`${topic.subject}-${topic.topic}`}>
                  <span>{topic.topic}</span>
                  <strong>{formatPercent(topic.accuracyPercent)}</strong>
                  <small>{subjectNames[locale][topic.subject]} · {formatDuration(topic.timeSpentMs)}</small>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section
          aria-label={text.solutionReview}
          className="analytics-panel solution-review"
          role="region"
        >
          <div className="analytics-panel__heading">
            <BookOpenCheck aria-hidden="true" />
            <h2>{text.solutionReview}</h2>
          </div>
          <div className="solution-list">
            {currentAttempt.paper.questions.map((question, index) => {
              const answer = currentAttempt.attempt.answers.find(
                (item) => item.questionId === question.id,
              );
              const result = currentAttempt.result.questionResults.find(
                (item) => item.questionId === question.id,
              );
              const correct = result?.status === "correct";

              return (
                <article key={question.id}>
                  <div className={correct ? "is-correct" : "is-incorrect"}>
                    {correct ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                  </div>
                  <section>
                    <span>Q{index + 1} · {question.topic}</span>
                    <h3>{question.stem[locale]}</h3>
                    <p>
                      {text.yourAnswer}: {answer?.selectedOptionId ?? text.unanswered}
                      <b>{text.correctAnswer}: {question.acceptedOptionIds.join(", ")}</b>
                    </p>
                    {question.solution && <small>{question.solution[locale]}</small>}
                  </section>
                </article>
              );
            })}
          </div>
        </section>

        <section className="analytics-panel" id="history">
          <div className="analytics-panel__heading">
            <Clock3 aria-hidden="true" />
            <h2>{text.attemptHistory}</h2>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <article key={item.attempt.id}>
                <div>
                  <strong>{item.paper.title[locale]}</strong>
                  <span>{new Date(item.attempt.submittedAt ?? item.attempt.startedAt).toLocaleString(locale === "en" ? "en-IN" : "hi-IN")}</span>
                </div>
                <span>{item.result.score} / {item.result.maxScore}</span>
                <span><ShieldCheck aria-hidden="true" /> {text.reviewed}</span>
                <Button aria-controls="analysis" aria-label={`${locale === "hi" ? "विश्लेषण देखें" : "View analysis"}: ${item.paper.title[locale]} · ${new Date(item.attempt.submittedAt ?? item.attempt.startedAt).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN")}`} aria-pressed={item.attempt.id === currentAttempt.attempt.id} onClick={() => setSelectedAttemptId(item.attempt.id)} tone="ghost">
                  {locale === "hi" ? "विश्लेषण देखें" : "View analysis"}
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-panel leaderboard-panel" id="leaderboard">
          <div className="leaderboard-heading">
            <div className="analytics-panel__heading">
              <Medal aria-hidden="true" />
              <div>
                <h2>{text.leaderboard}</h2>
                <p>{text.leaderboardNote}</p>
              </div>
            </div>
            <label className="privacy-control">
              <input
                aria-label={text.privacy}
                checked={hideName}
                disabled={privacyState === "saving"}
                onChange={async (event) => {
                  const previousValue = hideName;
                  const nextValue = event.target.checked;
                  setHideName(nextValue);
                  setPrivacyState("saving");
                  try {
                    const response = await fetch("/api/profile/privacy", {
                      method: "PATCH",
                      credentials: "same-origin",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ hideDisplayName: nextValue }),
                    });
                    if (!response.ok) throw new Error("Privacy update failed");
                    setPrivacyState("idle");
                  } catch {
                    setHideName(previousValue);
                    setPrivacyState("error");
                  }
                }}
                type="checkbox"
              />
              <span><LockKeyhole aria-hidden="true" /> {text.privacy}</span>
              <small>{text.privateNote}</small>
              {privacyState === "error" && <small role="alert">{text.privacyError}</small>}
            </label>
          </div>
          {!hasLoadedLeaderboard && <p role="status">{locale === "hi" ? "रैंकिंग नवीनतम पेपर के लिए उपलब्ध है। उसे इतिहास से चुनें।" : "Rankings are loaded for your latest paper. Select it from history to view them."}</p>}
          <div className="leaderboard-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{text.rank}</th>
                  <th>{text.aspirant}</th>
                  <th>{text.marks}</th>
                  <th>{text.time}</th>
                </tr>
              </thead>
              <tbody>
                {(hasLoadedLeaderboard ? leaderboard.entries : []).map((entry) => (
                  <tr className={entry.currentUser ? "is-current" : ""} key={`${entry.rank}-${entry.submittedAt}`}>
                    <td>#{entry.rank}</td>
                    <td>
                      {entry.currentUser && hideName
                        ? text.anonymous
                        : entry.displayName}
                    </td>
                    <td>{entry.score} / {entry.maxScore}</td>
                    <td>{formatDuration(entry.totalTimeMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="analytics-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
