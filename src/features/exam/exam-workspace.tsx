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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/features/localization/locale-provider";
import type { PaperVersion } from "@/features/exam/domain";
import { calculateServerClockOffset, finalizeSynchronizedAttempt, sendAttemptEvents, submitServerAttempt, type EventSyncOutcome } from "@/features/exam/client-attempt";
import {
  createAttemptEventSyncController,
  IndexedDbAttemptPersistence,
} from "@/features/exam/persistence";
import {
  buildAttemptGenerationStorageKey,
  buildAttemptRecoveryIdentity,
  createOnlineAttemptRecovery,
  createRetryingFinalizer,
  ensureServerAttempt,
  isLocalAttemptId,
  rebindExamSessionAttempt,
  validateRecoverableSession,
} from "@/features/exam/recovery";
import {
  createExamSession,
  examSessionReducer,
  mergeAnswerEvents,
  type ExamMode,
} from "@/features/exam/session";
import { formatExamTime, getRemainingTimeMs } from "@/features/exam/timer";
import { readBrowserPreference, removeBrowserPreference, writeBrowserPreference } from "@/lib/browser-storage";

function eventId() {
  return globalThis.crypto?.randomUUID?.() ?? "event-" + Date.now() + "-" + Math.random();
}

const examCopy = {
  en: {
    switchLanguage: "Switch question language",
    strictMock: "Strict mock · answers concealed",
    practice: "Practice · instant review",
    timeLeft: "Time left",
    openPalette: "Open question palette",
    closePalette: "Close question palette",
    answeredSuffix: "answered",
    question: (current: number, total: number) => `Question ${current} of ${total}`,
    optionalLimit: (limit: number) =>
      `This optional section allows only ${limit} answered question. Clear one response before choosing another.`,
    correct: "Correct",
    notQuite: "Not quite",
    correctAnswer: "Correct answer",
    previous: "Previous",
    clearResponse: "Clear response",
    unmarkReview: "Unmark review",
    markReview: "Mark for review",
    saveNext: "Save & next",
    questionPalette: "Question palette",
    answered: "Answered",
    remaining: "Remaining",
    review: "Review",
    questions: "questions",
    goToQuestion: (number: number) => `Go to question ${number}`,
    marked: "Marked",
    notAnswered: "Not answered",
    notVisited: "Not visited",
    eventsReady: (count: number) => `${count} events ready to sync`,
    submitTest: "Submit test",
    submitTitle: "Submit this attempt?",
    submitDescription: (answered: number, total: number) =>
      `You answered ${answered} of ${total} questions. Mock answers cannot be changed after submission.`,
    keepReviewing: "Keep reviewing",
    confirmSubmission: "Confirm submission",
    timeUp: "Time is up",
    submitted: "Attempt submitted",
    submittedDescription: "Your attempt has been scored using answers accepted by the server.",
    viewResults: "View results",
  },
  hi: {
    switchLanguage: "प्रश्न की भाषा बदलें",
    strictMock: "सख्त मॉक · उत्तर छिपे रहेंगे",
    practice: "अभ्यास · तुरंत समीक्षा",
    timeLeft: "समय शेष",
    openPalette: "प्रश्न पैलेट खोलें",
    closePalette: "प्रश्न पैलेट बंद करें",
    answeredSuffix: "उत्तर दिए",
    question: (current: number, total: number) => `प्रश्न ${current} / ${total}`,
    optionalLimit: (limit: number) =>
      `इस वैकल्पिक खंड में केवल ${limit} प्रश्न का उत्तर दिया जा सकता है। दूसरा उत्तर चुनने से पहले एक उत्तर हटाएँ।`,
    correct: "सही",
    notQuite: "सही नहीं",
    correctAnswer: "सही उत्तर",
    previous: "पिछला",
    clearResponse: "उत्तर हटाएँ",
    unmarkReview: "समीक्षा चिह्न हटाएँ",
    markReview: "समीक्षा के लिए चिह्नित करें",
    saveNext: "सहेजें और आगे",
    questionPalette: "प्रश्न पैलेट",
    answered: "उत्तर दिए",
    remaining: "शेष",
    review: "समीक्षा",
    questions: "प्रश्न",
    goToQuestion: (number: number) => `प्रश्न ${number} पर जाएँ`,
    marked: "चिह्नित",
    notAnswered: "उत्तर नहीं दिया",
    notVisited: "नहीं देखा",
    eventsReady: (count: number) => `${count} इवेंट सिंक के लिए तैयार`,
    submitTest: "टेस्ट जमा करें",
    submitTitle: "यह प्रयास जमा करें?",
    submitDescription: (answered: number, total: number) =>
      `आपने ${total} में से ${answered} प्रश्नों का उत्तर दिया है। जमा करने के बाद मॉक उत्तर बदले नहीं जा सकते।`,
    keepReviewing: "समीक्षा जारी रखें",
    confirmSubmission: "जमा करने की पुष्टि करें",
    timeUp: "समय समाप्त",
    submitted: "प्रयास जमा हो गया",
    submittedDescription: "आपके प्रयास का स्कोर सर्वर द्वारा स्वीकार किए गए उत्तरों से तैयार है।",
    viewResults: "परिणाम देखें",
  },
} as const;

const syncCopy: Record<"en" | "hi", Record<string, string>> = {
  en: {},
  hi: {
    "Saved locally": "इस डिवाइस पर सहेजा गया",
    "Saved and synchronized": "सहेजा और सिंक किया गया",
    "Offline · retrying": "ऑफ़लाइन · फिर प्रयास हो रहा है",
    "Offline · saved on this device": "ऑफ़लाइन · इस डिवाइस पर सहेजा गया",
    "Local recovery failed": "स्थानीय पुनर्प्राप्ति विफल",
    "Local save failed": "स्थानीय सहेजना विफल",
    "Connecting before submission…": "जमा करने से पहले कनेक्ट हो रहा है…",
    "Connected · confirm submission again": "कनेक्ट हो गया · जमा करने की फिर पुष्टि करें",
    "Offline · submission will retry": "ऑफ़लाइन · जमा करना फिर प्रयास करेगा",
    "Finalizing securely…": "सुरक्षित रूप से अंतिम रूप दिया जा रहा है…",
    "Submission waiting for answer sync": "जमा करना उत्तर सिंक की प्रतीक्षा में है",
    "Submitted and scored": "जमा और स्कोर किया गया",
    "Submission failed · retry safely": "जमा करना विफल · सुरक्षित पुनः प्रयास करें",
    "Expiry submission will retry": "समय-समाप्त जमा फिर प्रयास करेगा",
    "Sync needs attention · answers retained on this device": "सिंक पर ध्यान दें · उत्तर इस डिवाइस पर सुरक्षित हैं",
  },
};

export function ExamWorkspace({
  paper,
  mode,
  userId,
}: {
  paper: PaperVersion;
  mode: ExamMode;
  userId: string;
}) {
  const { locale, toggleLocale } = useLocale();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Saved locally");
  const persistenceRef = useRef<IndexedDbAttemptPersistence | undefined>(undefined);
  const syncControllerRef = useRef<
    ReturnType<typeof createAttemptEventSyncController> | undefined
  >(undefined);
  const attemptRecoveryRef = useRef<
    ReturnType<typeof createOnlineAttemptRecovery> | undefined
  >(undefined);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const serverClockOffsetRef = useRef(0);
  const authoritativeNow = () => Date.now() + serverClockOffsetRef.current;
  const [recoveryIdentity] = useState(() => {
    const generationStorageKey = buildAttemptGenerationStorageKey({
      userId,
      paperVersionId: paper.id,
      mode,
    });
    let generation =
      typeof window === "undefined"
        ? "server-render"
        : readBrowserPreference(generationStorageKey);
    if (!generation || generation === "server-render") {
      generation = globalThis.crypto?.randomUUID?.() ?? `generation-${Date.now()}`;
      if (typeof window !== "undefined") {
        writeBrowserPreference(generationStorageKey, generation);
      }
    }
    return buildAttemptRecoveryIdentity({
      userId,
      paperVersionId: paper.id,
      mode,
      generation,
    });
  });
  const [state, dispatch] = useReducer(
    examSessionReducer,
    null,
    () => {
      const nowMs = Date.now();
      return createExamSession({
        attemptId: recoveryIdentity.localAttemptId,
        paper,
        mode,
        nowMs,
        deadlineAtMs: nowMs + paper.durationMinutes * 60_000,
        recoveryIdentity,
      });
    },
  );
  const stateRef = useRef(state);
  const text = examCopy[locale];
  const displayedSyncMessage = syncCopy[locale][syncMessage] ?? syncMessage;

  const handleSyncOutcome = useCallback((outcome: EventSyncOutcome) => {
    if (outcome.status === "blocked") {
      setSyncMessage("Sync needs attention · answers retained on this device");
    } else if (outcome.status === "submitted" && stateRef.current.status !== "submitted" && stateRef.current.status !== "finalizing") {
      const restored = { ...stateRef.current, status: "finalizing" as const, syncNotice: "server_submitted" as const };
      stateRef.current = restored;
      dispatch({ type: "RESTORE_SESSION", state: restored });
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const dialogOpen =
      state.status === "submit_pending" ||
      state.status === "finalizing" ||
      state.status === "submitted";
    if (!dialogOpen) return;

    const background = backgroundRef.current;
    const dialog = dialogRef.current;
    const previouslyFocused =
      dialogTriggerRef.current ?? (document.activeElement as HTMLElement | null);
    background?.setAttribute("inert", "");
    background?.setAttribute("aria-hidden", "true");

    const focusable = Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const initialFocus =
      dialog?.querySelector<HTMLElement>("[data-initial-focus]") ?? focusable[0];
    initialFocus?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && state.status === "submit_pending") {
        event.preventDefault();
        dispatch({ type: "CANCEL_SUBMIT", occurredAt: authoritativeNow() });
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      background?.removeAttribute("inert");
      background?.removeAttribute("aria-hidden");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      dialogTriggerRef.current = null;
    };
  }, [state.status]);

  useEffect(() => {
    const timer = window.setInterval(
      () => dispatch({ type: "TICK", eventId: eventId(), nowMs: authoritativeNow() }),
      1_000,
    );

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;
    let cancelled = false;
    const persistence = new IndexedDbAttemptPersistence();
    persistenceRef.current = persistence;
    const localAttemptId = recoveryIdentity.localAttemptId;

    async function restoreLocalSession() {
      const saved = await persistence.loadSession(localAttemptId);
      const queuedEvents = await persistence.getQueuedEvents(localAttemptId);
      if (!saved && queuedEvents.length === 0) return;

      const baseSession = saved
        ? validateRecoverableSession(saved, recoveryIdentity)
        : stateRef.current;
      const eventQueue = mergeAnswerEvents(baseSession.eventQueue, queuedEvents);
      const restored = {
        ...baseSession,
        eventQueue,
        nextClientSequence: Math.max(
          baseSession.nextClientSequence,
          ...eventQueue.map((event) => event.clientSequence + 1),
        ),
      };
      stateRef.current = restored;
      dispatch({ type: "RESTORE_SESSION", state: restored });
    }

    async function connect() {
      const requestStartedAt = Date.now();
      const response = await fetch("/api/attempts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paperVersionId: paper.id,
          mode,
          strict: mode === "mock",
          visibility: "public",
          idempotencyKey: recoveryIdentity.idempotencyKey,
        }),
      });

      if (!response.ok) throw new Error("Attempt creation failed.");
      const created = await response.json();
      const responseReceivedAt = Date.now();
      serverClockOffsetRef.current = calculateServerClockOffset(
        requestStartedAt, responseReceivedAt, created.serverNow,
      );
      const saved = await persistence.loadSession(created.attemptId);
      const serverQueuedEvents = await persistence.getQueuedEvents(created.attemptId);
      const currentSession = stateRef.current;
      const baseSession = saved
        ? validateRecoverableSession(saved, recoveryIdentity)
        : validateRecoverableSession(currentSession, recoveryIdentity);
      const reboundBase = rebindExamSessionAttempt(
        baseSession,
        created.attemptId,
        Date.parse(created.deadlineAt),
        recoveryIdentity,
      );
      const authoritativeNowMs = authoritativeNow();
      const rebound = {
        ...reboundBase,
        nowMs: authoritativeNowMs,
        remainingMs: getRemainingTimeMs(
          reboundBase.deadlineAtMs,
          authoritativeNowMs,
        ),
      };
      const localEvents = isLocalAttemptId(currentSession.attemptId)
        ? currentSession.eventQueue.map((event) => ({
            ...event,
            attemptId: created.attemptId,
          }))
        : [];
      const eventQueue = mergeAnswerEvents(
        mergeAnswerEvents(rebound.eventQueue, serverQueuedEvents),
        localEvents,
      );
      const restored = {
        ...rebound,
        eventQueue,
        nextClientSequence: Math.max(
          rebound.nextClientSequence,
          ...eventQueue.map((event) => event.clientSequence + 1),
        ),
      };
      syncControllerRef.current = createAttemptEventSyncController({
        getEvents: () => stateRef.current.eventQueue,
        sendEvents: (events) => sendAttemptEvents(created.attemptId, events),
        reject: async (events) => {
          const ids = new Set(events.map((event) => event.id));
          const retained = {
            ...stateRef.current,
            eventQueue: stateRef.current.eventQueue.filter((event) => !ids.has(event.id)),
            rejectedEvents: mergeAnswerEvents(stateRef.current.rejectedEvents ?? [], events),
            syncNotice: "late_events" as const,
          };
          // Persist the rejected evidence before removing it from the pending store.
          await persistence.saveSession(retained);
          await persistence.markEventsSynced([...ids]);
          stateRef.current = retained;
          dispatch({ type: "RESTORE_SESSION", state: retained });
        },
        acknowledge: async (eventIds) => {
          await persistence.markEventsSynced(eventIds);
          const acknowledged = new Set(eventIds);
          stateRef.current = {
            ...stateRef.current,
            eventQueue: stateRef.current.eventQueue.filter(
              (event) => !acknowledged.has(event.id),
            ),
          };
          dispatch({ type: "ACK_EVENTS", eventIds });
          setSyncMessage("Saved and synchronized");
        },
      });

      if (!cancelled) {
        await persistence.migrateSessionAttempt(localAttemptId, restored);
        stateRef.current = restored;
        dispatch({ type: "RESTORE_SESSION", state: restored });
        setSyncMessage("Saved and synchronized");
        if (restored.eventQueue.length > 0) {
          void syncControllerRef.current.request().then(handleSyncOutcome).catch(() => {
            setSyncMessage("Offline · retrying");
          });
        }
      }
    }

    const recovery = createOnlineAttemptRecovery({
      connect,
      onDisconnected() {
        if (!cancelled) setSyncMessage("Offline · saved on this device");
      },
      subscribeOnline(listener) {
        window.addEventListener("online", listener);
        return () => window.removeEventListener("online", listener);
      },
    });
    attemptRecoveryRef.current = recovery;

    void restoreLocalSession()
      .catch(() => setSyncMessage("Local recovery failed"))
      .finally(() => {
        if (!cancelled) void recovery.start();
      });

    return () => {
      cancelled = true;
      recovery.stop();
      attemptRecoveryRef.current = undefined;
    };
  }, [mode, paper, recoveryIdentity, handleSyncOutcome]);

  useEffect(() => {
    if (process.env.NODE_ENV === "test" || !persistenceRef.current) return;
    const persistence = persistenceRef.current;

    if (state.status === "submitted") return;
    persistence.saveSession(state).catch(() => setSyncMessage("Local save failed"));
    persistence.queueEvents(state.eventQueue).catch(() => setSyncMessage("Offline · retrying"));

    if (state.eventQueue.length === 0 || isLocalAttemptId(state.attemptId)) return;

    syncControllerRef.current
      ?.request()
      .then(handleSyncOutcome)
      .catch(() => setSyncMessage("Offline · retrying"));
  }, [state, handleSyncOutcome]);

  useEffect(() => {
    const reconnect = () => {
      if (stateRef.current.status === "submitted") return;
      void syncControllerRef.current?.request().then(handleSyncOutcome).catch(() => setSyncMessage("Offline · retrying"));
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [handleSyncOutcome]);

  const confirmSubmission = useCallback(async () => {
    if (isLocalAttemptId(stateRef.current.attemptId)) {
      setSyncMessage("Connecting before submission…");
      const connected = await ensureServerAttempt({
        getAttemptId: () => stateRef.current.attemptId,
        connect: async () => await attemptRecoveryRef.current?.retry() ?? false,
      });
      if (!connected) {
        setSyncMessage("Offline · submission will retry");
        return false;
      }
    }

    try {
      setSyncMessage("Finalizing securely…");
      const outcome = await finalizeSynchronizedAttempt({
        sync: async () => {
          if (!syncControllerRef.current) throw new Error("Connection pending");
          return syncControllerRef.current.request();
        },
        submit: () => submitServerAttempt(stateRef.current.attemptId),
      });
      if (outcome.status === "blocked") {
        setSyncMessage("Sync needs attention · answers retained on this device");
        return "blocked" as const;
      }
      if (outcome.status === "retry") throw new Error("Submission pending");
      const completed = examSessionReducer(stateRef.current, { type: "CONFIRM_SUBMIT", submittedAt: Date.parse(outcome.result.submittedAt) });
      if (outcome.sync.status === "submitted") completed.syncNotice ??= "server_submitted";
      if (completed.rejectedEvents?.length || completed.eventQueue.length) {
        await persistenceRef.current?.saveSession(completed);
      } else {
        await persistenceRef.current?.retireAttempt(completed.attemptId);
      }
      await persistenceRef.current?.retireAttempt(recoveryIdentity.localAttemptId);
      removeBrowserPreference(recoveryIdentity.generationStorageKey);
      stateRef.current = completed;
      dispatch({ type: "RESTORE_SESSION", state: completed });
      setSyncMessage("Submitted and scored");
      return true;
    } catch {
      setSyncMessage("Submission failed · retry safely");
      return false;
    }
  }, [recoveryIdentity]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "test" ||
      state.status !== "finalizing"
    ) return;

    const finalizer = createRetryingFinalizer({
      finalize: confirmSubmission,
      retryDelayMs: 2_000,
      schedule: window.setTimeout,
      cancel: window.clearTimeout,
    });
    finalizer.start();
    return () => finalizer.stop();
  }, [state.status, state.submissionReason, state.attemptId, confirmSubmission]);

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

  function navigate(questionId: string | undefined, occurredAt: number) {
    if (questionId) {
      dispatch({ type: "NAVIGATE", eventId: eventId(), questionId, occurredAt });
      setPaletteOpen(false);
    }
  }

  return (
    <main className="exam-shell">
      <div data-testid="exam-background" ref={backgroundRef}>
      <header className="exam-topbar">
        <Link aria-label={locale === "hi" ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/">
          <BrandMark compact />
        </Link>
        <div className="exam-title">
          <strong>{paper.title[locale]}</strong>
          <span>
            <ShieldCheck aria-hidden="true" />
            {mode === "mock" ? text.strictMock : text.practice}
          </span>
        </div>
        <div className="exam-topbar__tools">
          <Button
            aria-label={text.switchLanguage}
            className="exam-language"
            onClick={toggleLocale}
            tone="ghost"
          >
            <Languages aria-hidden="true" size={17} />
            {locale === "en" ? "हिंदी" : "English"}
          </Button>
          <ThemeToggle />
          <div className={"exam-timer" + (state.remainingMs < 15 * 60_000 ? " is-low" : "")}>
            <Timer aria-hidden="true" />
            <span><small>{text.timeLeft}</small><strong>{formatExamTime(state.remainingMs)}</strong></span>
          </div>
          <Button
            aria-label={text.openPalette}
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
            onClick={() => navigate(section.questionIds[0], authoritativeNow())}
            type="button"
          >
            <span>{section.title[locale]}</span>
            <small>{sectionCounts[section.id] ?? 0}/{section.questionIds.length} {text.answeredSuffix}</small>
          </button>
        ))}
      </div>

      <div className="exam-layout">
        <section className="question-stage">
          <div className="question-stage__meta">
            <div>
              <span>{text.question(currentIndex + 1, paper.questions.length)}</span>
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
              {text.optionalLimit(state.limitWarning.selectionLimit)}
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
                        occurredAt: authoritativeNow(),
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
                  <p>{feedback.status === "correct" ? text.correct : text.notQuite}</p>
                  <h2>{text.correctAnswer}: {feedback.acceptedOptionIds.join(", ")}</h2>
                  {feedback.solution && <span>{feedback.solution[locale]}</span>}
                </section>
              </div>
            )}
          </article>

          <div className="question-actions">
            <div>
              <Button
                disabled={!previousQuestion}
                onClick={() => navigate(previousQuestion?.id, authoritativeNow())}
                tone="ghost"
              >
                <ChevronLeft aria-hidden="true" size={17} /> {text.previous}
              </Button>
              <Button
                disabled={!answer || mode === "practice"}
                onClick={() =>
                  dispatch({
                    type: "CLEAR_RESPONSE",
                    eventId: eventId(),
                    questionId: currentQuestion.id,
                    occurredAt: authoritativeNow(),
                  })
                }
                tone="ghost"
              >
                {text.clearResponse}
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
                  ? text.unmarkReview
                  : text.markReview}
              </Button>
              <Button
                disabled={!nextQuestion}
                onClick={() => navigate(nextQuestion?.id, authoritativeNow())}
              >
                {text.saveNext} <ChevronRight aria-hidden="true" size={17} />
              </Button>
            </div>
          </div>
        </section>

        <aside className={"exam-palette" + (paletteOpen ? " is-open" : "")}>
          <div className="exam-palette__mobile-head">
            <strong>{text.questionPalette}</strong>
            <Button aria-label={text.closePalette} onClick={() => setPaletteOpen(false)} tone="ghost">
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="exam-progress-card">
            <div>
              <strong>{answeredCount}</strong>
              <span>{text.answered}</span>
            </div>
            <div>
              <strong>{paper.questions.length - answeredCount}</strong>
              <span>{text.remaining}</span>
            </div>
            <div>
              <strong>{reviewCount}</strong>
              <span>{text.review}</span>
            </div>
          </div>

          <div className="palette-section">
            <div>
              <span>{currentSection.title[locale]}</span>
              <small>{currentSection.questionIds.length} {text.questions}</small>
            </div>
            <div className="palette-grid">
              {paper.questions.map((question, index) => {
                const answered = Boolean(state.answers[question.id]);
                const marked = state.markedForReview.includes(question.id);
                const current = question.id === currentQuestion.id;
                const visited = state.visitedQuestionIds.includes(question.id);

                return (
                  <button
                    aria-label={text.goToQuestion(index + 1)}
                    className={[
                      current ? "is-current" : "",
                      answered ? "is-answered" : "",
                      marked ? "is-review" : "",
                      visited && !answered && !marked ? "is-visited" : "",
                    ].filter(Boolean).join(" ")}
                    key={question.id}
                    onClick={() => navigate(question.id, authoritativeNow())}
                    type="button"
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="palette-legend">
            <span><i className="answered" /> {text.answered}</span>
            <span><i className="review" /> {text.marked}</span>
            <span><i className="visited" /> {text.notAnswered}</span>
            <span><i /> {text.notVisited}</span>
          </div>

          <div className="sync-status">
            <Cloud aria-hidden="true" />
            <span><strong>{displayedSyncMessage}</strong><small>{text.eventsReady(state.eventQueue.length)}</small></span>
          </div>

          <Button
            className="submit-test-button"
            onClick={(event) => {
              dialogTriggerRef.current = event.currentTarget;
              dispatch({ type: "REQUEST_SUBMIT", eventId: eventId(), occurredAt: authoritativeNow() });
            }}
            tone="secondary"
          >
            <ListChecks aria-hidden="true" size={17} />
            {text.submitTest}
          </Button>
        </aside>
      </div>
      </div>

      {state.status === "submit_pending" && (
        <div className="exam-modal-backdrop" role="presentation">
          <section
            aria-describedby="submit-attempt-description"
            aria-labelledby="submit-attempt-title"
            aria-modal="true"
            className="exam-submit-modal"
            ref={dialogRef}
            role="dialog"
          >
            <div className="exam-submit-modal__icon">
              <Flag aria-hidden="true" />
            </div>
            <h2 id="submit-attempt-title">{text.submitTitle}</h2>
            <p id="submit-attempt-description">{text.submitDescription(answeredCount, paper.questions.length)}</p>
            <div>
              <Button onClick={() => dispatch({ type: "CANCEL_SUBMIT", occurredAt: authoritativeNow() })} tone="ghost">{text.keepReviewing}</Button>
              <Button autoFocus data-initial-focus onClick={confirmSubmission}>
                {text.confirmSubmission}
              </Button>
            </div>
          </section>
        </div>
      )}

      {(state.status === "finalizing" || state.status === "submitted") && (
        <div className="exam-modal-backdrop">
          <section
            aria-labelledby="submission-complete-title"
            aria-modal="true"
            className="exam-submit-modal"
            ref={dialogRef}
            role="dialog"
          >
            <div className="exam-submit-modal__icon is-success">
              {state.status === "submitted" ? <Check aria-hidden="true" /> : <Cloud aria-hidden="true" />}
            </div>
            <h2 id="submission-complete-title">{state.submissionReason === "expired" ? text.timeUp : text.submitted}</h2>
            <p>{state.status === "submitted" ? text.submittedDescription : displayedSyncMessage}</p>
            {state.syncNotice === "late_events" && <p role="alert">{locale === "hi"
              ? "समय-सीमा के बाद पहुँचे कुछ उत्तर स्वीकार नहीं हुए। वे इस डिवाइस पर सुरक्षित हैं; परिणाम में केवल सर्वर द्वारा स्वीकार उत्तर शामिल हैं।"
              : "Some answers arrived too late to be accepted. They are retained on this device; results include only answers accepted by the server."}</p>}
            {state.syncNotice === "server_submitted" && <p role="status">{locale === "hi"
              ? "सर्वर पर जमा परिणाम पुनर्प्राप्त किया गया। लंबित स्थानीय इवेंट इस डिवाइस पर सुरक्षित हैं।"
              : "Recovered the submitted server result. Pending local events are retained on this device."}</p>}
            {state.status === "submitted" && (
              <Link className="button button--primary" data-initial-focus href="/dashboard">{text.viewResults}</Link>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
