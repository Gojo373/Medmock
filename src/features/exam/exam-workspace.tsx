"use client";

import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Flag,
  Languages,
  ListChecks,
  Menu,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useReducer, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import type { PaperVersion } from "@/features/exam/domain";
import {
  createExamSession,
  examSessionReducer,
  type ExamMode,
} from "@/features/exam/session";
import { formatExamTime } from "@/features/exam/timer";

function eventId() {
  return globalThis.crypto?.randomUUID?.() ?? "event-" + Date.now() + "-" + Math.random();
}

export function ExamWorkspace({
  paper,
  mode,
}: {
  paper: PaperVersion;
  mode: ExamMode;
}) {
  const [locale, setLocale] = useState<"en" | "hi">("en");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [state, dispatch] = useReducer(
    examSessionReducer,
    null,
    () => {
      const nowMs = Date.now();
      return createExamSession({
        attemptId: "local-" + paper.id,
        paper,
        mode,
        nowMs,
        deadlineAtMs: nowMs + paper.durationMinutes * 60_000,
      });
    },
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => dispatch({ type: "TICK", nowMs: Date.now() }),
      1_000,
    );

    return () => window.clearInterval(timer);
  }, []);

  const currentQuestion = paper.questions.find(
    (question) => question.id === state.currentQuestionId,
  )!;
  const currentIndex = paper.questions.findIndex(
    (question) => question.id === currentQuestion.id,
  );
  const currentSection = paper.sections.find(
    (section) => section.id === currentQuestion.sectionId,
  )!;
  const answer = state.answers[currentQuestion.id];
  const feedback = state.feedbackByQuestion[currentQuestion.id];
  const answeredCount = Object.keys(state.answers).length;
  const reviewCount = state.markedForReview.length;
  const nextQuestion = paper.questions[currentIndex + 1];
  const previousQuestion = paper.questions[currentIndex - 1];

  const sectionCounts = useMemo(
    () =>
      Object.fromEntries(
        paper.sections.map((section) => [
          section.id,
          section.questionIds.filter((questionId) => state.answers[questionId]).length,
        ]),
      ),
    [paper.sections, state.answers],
  );

  function navigate(questionId: string | undefined) {
    if (questionId) {
      dispatch({ type: "NAVIGATE", questionId });
      setPaletteOpen(false);
    }
  }

  return (
    <main className="exam-shell">
      <header className="exam-topbar">
        <Link aria-label="MedMock home" href="/">
          <BrandMark compact />
        </Link>
        <div className="exam-title">
          <strong>{paper.title[locale]}</strong>
          <span>
            <ShieldCheck aria-hidden="true" />
            {mode === "mock" ? "Strict mock · answers concealed" : "Practice · instant review"}
          </span>
        </div>
        <div className="exam-topbar__tools">
          <Button
            aria-label="Switch question language"
            className="exam-language"
            onClick={() => setLocale((value) => (value === "en" ? "hi" : "en"))}
            tone="ghost"
          >
            <Languages aria-hidden="true" size={17} />
            {locale === "en" ? "हिंदी" : "English"}
          </Button>
          <ThemeToggle />
          <div className={"exam-timer" + (state.remainingMs < 15 * 60_000 ? " is-low" : "")}>
            <Timer aria-hidden="true" />
            <span><small>Time left</small><strong>{formatExamTime(state.remainingMs)}</strong></span>
          </div>
          <Button
            aria-label="Open question palette"
            className="exam-palette-toggle"
            onClick={() => setPaletteOpen(true)}
            tone="ghost"
          >
            <Menu aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="exam-subject-bar">
        {paper.sections.map((section) => (
          <button
            className={section.id === currentSection.id ? "is-active" : ""}
            key={section.id}
            onClick={() => navigate(section.questionIds[0])}
            type="button"
          >
            <span>{section.title[locale]}</span>
            <small>{sectionCounts[section.id] ?? 0}/{section.questionIds.length} answered</small>
          </button>
        ))}
      </div>

      <div className="exam-layout">
        <section className="question-stage">
          <div className="question-stage__meta">
            <div>
              <span>Question {currentIndex + 1} of {paper.questions.length}</span>
              <strong>{currentQuestion.topic}</strong>
            </div>
            <div className="marking-chip">
              <span>+{currentQuestion.marking.correct}</span>
              <i>{currentQuestion.marking.incorrect}</i>
            </div>
          </div>

          {state.limitWarning && (
            <div className="exam-warning" role="alert">
              <AlertCircle aria-hidden="true" />
              This optional section allows only {state.limitWarning.selectionLimit} answered question.
              Clear one response before choosing another.
            </div>
          )}

          <article className="question-card">
            <div className="question-card__number">Q{currentIndex + 1}</div>
            <h1>{currentQuestion.stem[locale]}</h1>
            <div className="answer-options">
              {currentQuestion.options.map((option) => {
                const selected = answer?.selectedOptionId === option.id;
                const correct = feedback?.acceptedOptionIds.includes(option.id);
                const incorrectSelected = Boolean(feedback && selected && !correct);

                return (
                  <button
                    aria-label={option.id + ". " + option.text[locale]}
                    aria-pressed={selected}
                    className={[
                      selected ? "is-selected" : "",
                      correct ? "is-correct" : "",
                      incorrectSelected ? "is-incorrect" : "",
                    ].filter(Boolean).join(" ")}
                    key={option.id}
                    onClick={() =>
                      dispatch({
                        type: "SELECT_OPTION",
                        eventId: eventId(),
                        questionId: currentQuestion.id,
                        optionId: option.id,
                        occurredAt: Date.now(),
                      })
                    }
                    type="button"
                  >
                    <span>{option.id}</span>
                    <strong>{option.text[locale]}</strong>
                    {selected && <Check aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {feedback && (
              <div className={"practice-feedback is-" + feedback.status}>
                <div>
                  {feedback.status === "correct" ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                </div>
                <section>
                  <p>{feedback.status === "correct" ? "Correct" : "Not quite"}</p>
                  <h2>Correct answer: {feedback.acceptedOptionIds.join(", ")}</h2>
                  {feedback.solution && <span>{feedback.solution[locale]}</span>}
                </section>
              </div>
            )}
          </article>

          <div className="question-actions">
            <div>
              <Button
                disabled={!previousQuestion}
                onClick={() => navigate(previousQuestion?.id)}
                tone="ghost"
              >
                <ChevronLeft aria-hidden="true" size={17} /> Previous
              </Button>
              <Button
                disabled={!answer || mode === "practice"}
                onClick={() =>
                  dispatch({
                    type: "CLEAR_RESPONSE",
                    eventId: eventId(),
                    questionId: currentQuestion.id,
                    occurredAt: Date.now(),
                  })
                }
                tone="ghost"
              >
                Clear response
              </Button>
            </div>
            <div>
              <Button
                onClick={() =>
                  dispatch({ type: "TOGGLE_REVIEW", questionId: currentQuestion.id })
                }
                tone="secondary"
              >
                <Bookmark aria-hidden="true" size={16} />
                {state.markedForReview.includes(currentQuestion.id)
                  ? "Unmark review"
                  : "Mark for review"}
              </Button>
              <Button disabled={!nextQuestion} onClick={() => navigate(nextQuestion?.id)}>
                Save & next <ChevronRight aria-hidden="true" size={17} />
              </Button>
            </div>
          </div>
        </section>

        <aside className={"exam-palette" + (paletteOpen ? " is-open" : "")}>
          <div className="exam-palette__mobile-head">
            <strong>Question palette</strong>
            <Button aria-label="Close question palette" onClick={() => setPaletteOpen(false)} tone="ghost">
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="exam-progress-card">
            <div>
              <strong>{answeredCount}</strong>
              <span>Answered</span>
            </div>
            <div>
              <strong>{paper.questions.length - answeredCount}</strong>
              <span>Remaining</span>
            </div>
            <div>
              <strong>{reviewCount}</strong>
              <span>Review</span>
            </div>
          </div>

          <div className="palette-section">
            <div>
              <span>{currentSection.title[locale]}</span>
              <small>{currentSection.questionIds.length} questions</small>
            </div>
            <div className="palette-grid">
              {paper.questions.map((question, index) => {
                const answered = Boolean(state.answers[question.id]);
                const marked = state.markedForReview.includes(question.id);
                const current = question.id === currentQuestion.id;
                const visited = state.visitedQuestionIds.includes(question.id);

                return (
                  <button
                    aria-label={"Go to question " + (index + 1)}
                    className={[
                      current ? "is-current" : "",
                      answered ? "is-answered" : "",
                      marked ? "is-review" : "",
                      visited && !answered && !marked ? "is-visited" : "",
                    ].filter(Boolean).join(" ")}
                    key={question.id}
                    onClick={() => navigate(question.id)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="palette-legend">
            <span><i className="answered" /> Answered</span>
            <span><i className="review" /> Marked</span>
            <span><i className="visited" /> Not answered</span>
            <span><i /> Not visited</span>
          </div>

          <div className="sync-status">
            <Cloud aria-hidden="true" />
            <span><strong>Saved locally</strong><small>{state.eventQueue.length} events ready to sync</small></span>
          </div>

          <Button className="submit-test-button" onClick={() => dispatch({ type: "REQUEST_SUBMIT" })} tone="secondary">
            <ListChecks aria-hidden="true" size={17} />
            Submit test
          </Button>
        </aside>
      </div>

      {state.status === "submit_pending" && (
        <div className="exam-modal-backdrop" role="presentation">
          <section aria-modal="true" className="exam-submit-modal" role="dialog">
            <div className="exam-submit-modal__icon">
              <Flag aria-hidden="true" />
            </div>
            <h2>Submit this attempt?</h2>
            <p>You answered {answeredCount} of {paper.questions.length} questions. Mock answers cannot be changed after submission.</p>
            <div>
              <Button onClick={() => dispatch({ type: "CANCEL_SUBMIT" })} tone="ghost">Keep reviewing</Button>
              <Button onClick={() => dispatch({ type: "CONFIRM_SUBMIT", submittedAt: Date.now() })}>
                Confirm submission
              </Button>
            </div>
          </section>
        </div>
      )}

      {state.status === "submitted" && (
        <div className="exam-modal-backdrop">
          <section className="exam-submit-modal">
            <div className="exam-submit-modal__icon is-success"><Check aria-hidden="true" /></div>
            <h2>{state.submissionReason === "expired" ? "Time is up" : "Attempt submitted"}</h2>
            <p>Your answers are safely queued for final scoring and synchronization.</p>
            <Button>View results</Button>
          </section>
        </div>
      )}
    </main>
  );
}
