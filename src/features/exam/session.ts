import {
  PaperVersionSchema,
  type LocalizedText,
  type PaperVersion,
} from "@/features/exam/domain";
import { getRemainingTimeMs } from "@/features/exam/timer";

export type ExamMode = "mock" | "practice";
export type SessionStatus = "active" | "submit_pending" | "submitted";
export type SubmissionReason = "manual" | "expired";

export type AnswerEvent = {
  id: string;
  attemptId: string;
  questionId: string;
  type: "answer_selected" | "answer_cleared" | "time_spent";
  selectedOptionId?: string;
  occurredAt: number;
  clientSequence: number;
  timeSpentMs: number;
};

export type SessionAnswer = {
  selectedOptionId: string;
  answeredAt: number;
  locked: boolean;
};

export type PracticeFeedback = {
  status: "correct" | "incorrect";
  acceptedOptionIds: string[];
  solution?: LocalizedText;
};

export type ExamSessionState = {
  attemptId: string;
  paper: PaperVersion;
  mode: ExamMode;
  status: SessionStatus;
  currentQuestionId: string;
  visitedQuestionIds: string[];
  answers: Record<string, SessionAnswer>;
  markedForReview: string[];
  feedbackByQuestion: Record<string, PracticeFeedback>;
  eventQueue: AnswerEvent[];
  nextClientSequence: number;
  timeSpentByQuestionMs: Record<string, number>;
  questionEnteredAtMs: number;
  nowMs: number;
  deadlineAtMs: number;
  remainingMs: number;
  submissionReason?: SubmissionReason;
  submittedAt?: number;
  limitWarning?: {
    sectionId: string;
    selectionLimit: number;
  };
};

export type ExamSessionAction =
  | { type: "RESTORE_SESSION"; state: ExamSessionState }
  | { type: "ACK_EVENTS"; eventIds: string[] }
  | { type: "NAVIGATE"; eventId: string; questionId: string; occurredAt: number }
  | { type: "TOGGLE_REVIEW"; questionId: string }
  | {
      type: "SELECT_OPTION";
      eventId: string;
      questionId: string;
      optionId: string;
      occurredAt: number;
    }
  | {
      type: "CLEAR_RESPONSE";
      eventId: string;
      questionId: string;
      occurredAt: number;
    }
  | { type: "REQUEST_SUBMIT"; eventId: string; occurredAt: number }
  | { type: "CANCEL_SUBMIT"; occurredAt: number }
  | { type: "CONFIRM_SUBMIT"; submittedAt: number }
  | { type: "TICK"; eventId: string; nowMs: number };

export function createExamSession({
  attemptId,
  paper: paperInput,
  mode,
  nowMs,
  deadlineAtMs,
}: {
  attemptId: string;
  paper: PaperVersion;
  mode: ExamMode;
  nowMs: number;
  deadlineAtMs: number;
}): ExamSessionState {
  const paper = PaperVersionSchema.parse(paperInput);
  const firstQuestion = paper.questions[0];

  if (!firstQuestion) {
    throw new Error("An exam session requires at least one question.");
  }

  return {
    attemptId,
    paper,
    mode,
    status: "active",
    currentQuestionId: firstQuestion.id,
    visitedQuestionIds: [firstQuestion.id],
    answers: {},
    markedForReview: [],
    feedbackByQuestion: {},
    eventQueue: [],
    nextClientSequence: 1,
    timeSpentByQuestionMs: {},
    questionEnteredAtMs: nowMs,
    nowMs,
    deadlineAtMs,
    remainingMs: getRemainingTimeMs(deadlineAtMs, nowMs),
  };
}

function getQuestion(state: ExamSessionState, questionId: string) {
  const question = state.paper.questions.find((item) => item.id === questionId);

  if (!question) {
    throw new Error("Question does not belong to this paper.");
  }

  return question;
}

function getSection(state: ExamSessionState, sectionId: string) {
  const section = state.paper.sections.find((item) => item.id === sectionId);

  if (!section) {
    throw new Error("Question section does not belong to this paper.");
  }

  return section;
}

function canAnswerQuestion(state: ExamSessionState, questionId: string) {
  const question = getQuestion(state, questionId);
  const section = getSection(state, question.sectionId);

  if (!section.selectionLimit || state.answers[questionId]) {
    return { allowed: true as const };
  }

  const answeredCount = section.questionIds.filter(
    (sectionQuestionId) => Boolean(state.answers[sectionQuestionId]),
  ).length;

  if (answeredCount >= section.selectionLimit) {
    return {
      allowed: false as const,
      warning: {
        sectionId: section.id,
        selectionLimit: section.selectionLimit,
      },
    };
  }

  return { allowed: true as const };
}

function appendEvent(
  state: ExamSessionState,
  event: Omit<AnswerEvent, "attemptId" | "clientSequence">,
) {
  const answerEvent: AnswerEvent = {
    ...event,
    attemptId: state.attemptId,
    clientSequence: state.nextClientSequence,
  };

  return {
    eventQueue: [...state.eventQueue, answerEvent],
    nextClientSequence: state.nextClientSequence + 1,
  };
}

function recordCurrentQuestionTime(
  state: ExamSessionState,
  eventId: string,
  occurredAt: number,
) {
  const elapsedMs = Math.max(0, occurredAt - state.questionEnteredAtMs);
  const timeSpentMs =
    (state.timeSpentByQuestionMs[state.currentQuestionId] ?? 0) + elapsedMs;
  const eventState = appendEvent(state, {
    id: eventId,
    questionId: state.currentQuestionId,
    type: "time_spent",
    occurredAt,
    timeSpentMs,
  });

  return {
    ...state,
    ...eventState,
    timeSpentByQuestionMs: {
      ...state.timeSpentByQuestionMs,
      [state.currentQuestionId]: timeSpentMs,
    },
    questionEnteredAtMs: occurredAt,
  };
}

export function examSessionReducer(
  state: ExamSessionState,
  action: ExamSessionAction,
): ExamSessionState {
  if (action.type === "RESTORE_SESSION") return action.state;

  if (action.type === "ACK_EVENTS") {
    const acknowledged = new Set(action.eventIds);
    return {
      ...state,
      eventQueue: state.eventQueue.filter((event) => !acknowledged.has(event.id)),
    };
  }

  if (action.type === "TICK") {
    const remainingMs = getRemainingTimeMs(state.deadlineAtMs, action.nowMs);

    if (remainingMs === 0 && state.status !== "submitted") {
      const timedState = recordCurrentQuestionTime(
        state,
        action.eventId,
        action.nowMs,
      );
      return {
        ...timedState,
        nowMs: action.nowMs,
        remainingMs,
        status: "submitted",
        submissionReason: "expired",
        submittedAt: action.nowMs,
      };
    }

    return { ...state, nowMs: action.nowMs, remainingMs };
  }

  if (state.status === "submitted") {
    return state;
  }

  if (action.type === "NAVIGATE") {
    getQuestion(state, action.questionId);
    if (action.questionId === state.currentQuestionId) return state;
    const timedState = recordCurrentQuestionTime(
      state,
      action.eventId,
      action.occurredAt,
    );

    return {
      ...timedState,
      currentQuestionId: action.questionId,
      visitedQuestionIds: timedState.visitedQuestionIds.includes(action.questionId)
        ? timedState.visitedQuestionIds
        : [...timedState.visitedQuestionIds, action.questionId],
      limitWarning: undefined,
    };
  }

  if (action.type === "TOGGLE_REVIEW") {
    getQuestion(state, action.questionId);
    const marked = state.markedForReview.includes(action.questionId);

    return {
      ...state,
      markedForReview: marked
        ? state.markedForReview.filter((questionId) => questionId !== action.questionId)
        : [...state.markedForReview, action.questionId],
    };
  }

  if (action.type === "SELECT_OPTION") {
    const question = getQuestion(state, action.questionId);
    const optionExists = question.options.some((option) => option.id === action.optionId);

    if (!optionExists) {
      throw new Error("Option does not belong to this question.");
    }

    if (state.mode === "practice" && state.answers[action.questionId]?.locked) {
      return state;
    }

    const eligibility = canAnswerQuestion(state, action.questionId);

    if (!eligibility.allowed) {
      return { ...state, limitWarning: eligibility.warning };
    }

    const eventState = appendEvent(state, {
      id: action.eventId,
      questionId: action.questionId,
      type: "answer_selected",
      selectedOptionId: action.optionId,
      occurredAt: action.occurredAt,
      timeSpentMs:
        (state.timeSpentByQuestionMs[action.questionId] ?? 0) +
        Math.max(0, action.occurredAt - state.questionEnteredAtMs),
    });
    const answers = {
      ...state.answers,
      [action.questionId]: {
        selectedOptionId: action.optionId,
        answeredAt: action.occurredAt,
        locked: state.mode === "practice",
      },
    };
    const feedbackByQuestion =
      state.mode === "practice"
        ? {
            ...state.feedbackByQuestion,
            [action.questionId]: {
              status: question.acceptedOptionIds.includes(action.optionId)
                ? ("correct" as const)
                : ("incorrect" as const),
              acceptedOptionIds: question.acceptedOptionIds,
              solution: question.solution,
            },
          }
        : state.feedbackByQuestion;

    return {
      ...state,
      ...eventState,
      answers,
      timeSpentByQuestionMs: {
        ...state.timeSpentByQuestionMs,
        [action.questionId]: eventState.eventQueue.at(-1)!.timeSpentMs,
      },
      questionEnteredAtMs: action.occurredAt,
      feedbackByQuestion,
      limitWarning: undefined,
    };
  }

  if (action.type === "CLEAR_RESPONSE") {
    const currentAnswer = state.answers[action.questionId];

    if (!currentAnswer || (state.mode === "practice" && currentAnswer.locked)) {
      return state;
    }

    const eventState = appendEvent(state, {
      id: action.eventId,
      questionId: action.questionId,
      type: "answer_cleared",
      occurredAt: action.occurredAt,
      timeSpentMs:
        (state.timeSpentByQuestionMs[action.questionId] ?? 0) +
        Math.max(0, action.occurredAt - state.questionEnteredAtMs),
    });
    const answers = { ...state.answers };
    delete answers[action.questionId];

    return {
      ...state,
      ...eventState,
      answers,
      timeSpentByQuestionMs: {
        ...state.timeSpentByQuestionMs,
        [action.questionId]: eventState.eventQueue.at(-1)!.timeSpentMs,
      },
      questionEnteredAtMs: action.occurredAt,
      limitWarning: undefined,
    };
  }

  if (action.type === "REQUEST_SUBMIT" && state.status === "active") {
    return {
      ...recordCurrentQuestionTime(state, action.eventId, action.occurredAt),
      status: "submit_pending",
    };
  }

  if (action.type === "CANCEL_SUBMIT" && state.status === "submit_pending") {
    return {
      ...state,
      status: "active",
      questionEnteredAtMs: action.occurredAt,
    };
  }

  if (action.type === "CONFIRM_SUBMIT" && state.status === "submit_pending") {
    return {
      ...state,
      status: "submitted",
      submissionReason: "manual",
      submittedAt: action.submittedAt,
    };
  }

  return state;
}

export function mergeAnswerEvents(
  localEvents: AnswerEvent[],
  remoteEvents: AnswerEvent[],
) {
  const eventById = new Map<string, AnswerEvent>();

  for (const event of [...localEvents, ...remoteEvents]) {
    eventById.set(event.id, event);
  }

  return Array.from(eventById.values()).sort(
    (left, right) =>
      left.clientSequence - right.clientSequence ||
      left.occurredAt - right.occurredAt ||
      left.id.localeCompare(right.id),
  );
}

export function materializeAnswers(events: AnswerEvent[]) {
  const answers: Record<
    string,
    { selectedOptionId: string; answeredAt: number; timeSpentMs: number }
  > = {};
  const timeSpentByQuestionMs: Record<string, number> = {};

  for (const event of mergeAnswerEvents([], events)) {
    timeSpentByQuestionMs[event.questionId] = Math.max(
      timeSpentByQuestionMs[event.questionId] ?? 0,
      event.timeSpentMs,
    );
    if (event.type === "answer_cleared") {
      delete answers[event.questionId];
    } else if (event.type === "answer_selected" && event.selectedOptionId) {
      answers[event.questionId] = {
        selectedOptionId: event.selectedOptionId,
        answeredAt: event.occurredAt,
        timeSpentMs: event.timeSpentMs,
      };
    } else if (answers[event.questionId]) {
      answers[event.questionId].timeSpentMs = timeSpentByQuestionMs[event.questionId];
    }
  }

  return answers;
}
