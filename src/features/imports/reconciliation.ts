import {
  PaperVersionSchema,
  type PaperVersion,
} from "@/features/exam/domain";
import {
  ReconciledImportSchema,
  ExtractionPaperSchema,
  type ExtractionDocument,
  type ExtractionPaper,
  type ExtractionQuestion,
  type ReconciledImport,
  type ReviewFlag,
} from "@/features/imports/schema";

const confidenceThreshold = 0.8;
const confidenceFields = [
  "stem",
  "options",
  "answerKey",
  "translation",
  "solution",
] as const;

type ReconciliationOptions = {
  officialAnswerKey?: Record<string, string[]>;
  officialAnswerKeyFileId?: string;
};

type PublishIssue = {
  code: "missing_required_content" | "unresolved_review_flags";
  message: string;
  paths: string[];
};

function stableValue(value: unknown) {
  return JSON.stringify(value ?? null);
}

function makeFlag(
  code: ReviewFlag["code"],
  path: string,
  message: string,
  severity: ReviewFlag["severity"] = "warning",
  providerValues?: Record<string, unknown>,
): ReviewFlag {
  return {
    id: code + ":" + path,
    code,
    path,
    message,
    severity,
    resolved: false,
    providerValues,
  };
}

function addFlag(flags: ReviewFlag[], flag: ReviewFlag) {
  if (!flags.some((item) => item.id === flag.id)) {
    flags.push(flag);
  }
}

function getQuestion(
  document: ExtractionDocument,
  sourceNumber: string,
): ExtractionQuestion | undefined {
  return document.paper.questions.find(
    (question) => question.sourceNumber === sourceNumber,
  );
}

function collectMissingPaths(paper: ExtractionPaper) {
  const paths: string[] = [];

  if (!paper.title?.en) paths.push("paper.title.en");
  if (!paper.year) paths.push("paper.year");
  if (!paper.durationMinutes) paths.push("paper.durationMinutes");
  if (paper.questions.length === 0) paths.push("paper.questions");

  const sourceNumbers = paper.questions.map((question) => question.sourceNumber);
  if (new Set(sourceNumbers).size !== sourceNumbers.length) paths.push("paper.questions");
  const sectionIds = paper.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) paths.push("paper.sections");
  for (const section of paper.sections) {
    const base = `paper.sections.${section.id}`;
    if (!section.title?.en) paths.push(`${base}.title.en`);
    if (!section.questionNumbers.length || new Set(section.questionNumbers).size !== section.questionNumbers.length ||
      section.questionNumbers.some((number) => !paper.questions.some((question) => question.sourceNumber === number && question.sectionId === section.id && question.subject === section.subject))) {
      paths.push(`${base}.questionNumbers`);
    }
    if (section.selectionLimit && section.selectionLimit > section.questionNumbers.length) paths.push(`${base}.selectionLimit`);
  }

  for (const question of paper.questions) {
    const base = "questions." + question.sourceNumber;

    if (!question.sectionId) paths.push(base + ".sectionId");
    if (paper.sections.length && !paper.sections.some((section) => section.id === question.sectionId && section.questionNumbers.includes(question.sourceNumber))) paths.push(base + ".sectionId");
    if (!question.subject) paths.push(base + ".subject");
    if (!question.topic) paths.push(base + ".topic");
    if (!question.stem?.en) paths.push(base + ".stem.en");
    if (question.options.length < 2) paths.push(base + ".options");

    for (const option of question.options) {
      if (!option.text?.en) paths.push(base + ".options." + option.id + ".text.en");
    }

    if (question.acceptedOptionIds.length === 0) {
      paths.push(base + ".acceptedOptionIds");
    }

    const optionIds = new Set(question.options.map((option) => option.id));
    if (question.acceptedOptionIds.some((optionId) => !optionIds.has(optionId))) {
      paths.push(base + ".acceptedOptionIds.invalid");
    }

    if (!question.solution?.en) paths.push(base + ".solution.en");
  }

  return paths;
}

function questionHasHindi(question: ExtractionQuestion) {
  return Boolean(
    question.stem?.hi ||
    question.solution?.hi ||
    question.options.some((option) => option.text?.hi),
  );
}

export function normalizeOptionalHindiReviewFlags(
  draftInput: ReconciledImport,
): ReconciledImport {
  const draft = structuredClone(draftInput);
  draft.reviewFlags = draft.reviewFlags.filter((flag) => {
    if (flag.code === "missing_field" && flag.path.endsWith(".hi")) {
      return false;
    }
    const translationMatch = /^questions\.([^.]+)\.confidence\.translation$/.exec(flag.path);
    if (flag.code === "low_confidence" && translationMatch) {
      const question = draft.paper.questions.find(
        (item) => item.sourceNumber === translationMatch[1],
      );
      return question ? questionHasHindi(question) : true;
    }
    return true;
  });
  return ReconciledImportSchema.parse(draft);
}

function addContentReviewFlags(paper: ExtractionPaper, flags: ReviewFlag[]) {
  for (const path of collectMissingPaths(paper)) {
    addFlag(
      flags,
      makeFlag(
        path.endsWith(".invalid") ? "invalid_answer_key" : "missing_field",
        path.replace(/\.invalid$/, ""),
        "Required reviewed content is missing or invalid.",
        "error",
      ),
    );
  }

  for (const question of paper.questions) {
    for (const field of confidenceFields) {
      if (field === "translation" && !questionHasHindi(question)) continue;
      const confidence = question.confidence[field];
      if (confidence === undefined || confidence < confidenceThreshold) {
        addFlag(
          flags,
          makeFlag(
            "low_confidence",
            "questions." + question.sourceNumber + ".confidence." + field,
            "This extracted field needs a human confidence check.",
          ),
        );
      }
    }
  }
}

function compareQuestionField(
  documents: ExtractionDocument[],
  sourceNumber: string,
  path: string,
  value: (question: ExtractionQuestion) => unknown,
  flags: ReviewFlag[],
) {
  const providerValues = Object.fromEntries(
    documents.flatMap((document) => {
      const question = getQuestion(document, sourceNumber);
      return question ? [[document.provider, value(question)]] : [];
    }),
  );
  const distinctValues = new Set(Object.values(providerValues).map(stableValue));

  if (distinctValues.size > 1) {
    addFlag(
      flags,
      makeFlag(
        "provider_conflict",
        "questions." + sourceNumber + "." + path,
        "Providers disagree on this field; choose the reviewed value.",
        "warning",
        providerValues,
      ),
    );
  }
}

function compareProviderField(
  documents: ExtractionDocument[],
  path: string,
  value: (document: ExtractionDocument) => unknown,
  flags: ReviewFlag[],
) {
  const providerValues = Object.fromEntries(
    documents.map((document) => [document.provider, value(document)]),
  );
  if (new Set(Object.values(providerValues).map(stableValue)).size > 1) {
    addFlag(
      flags,
      makeFlag(
        "provider_conflict",
        path,
        "Providers disagree on this field; choose the reviewed value.",
        "warning",
        providerValues,
      ),
    );
  }
}

export function reconcileExtractions(
  documents: ExtractionDocument[],
  options: ReconciliationOptions = {},
): ReconciledImport {
  if (documents.length === 0) {
    throw new Error("At least one extraction document is required.");
  }

  const paper = structuredClone(documents[0].paper);
  const flags: ReviewFlag[] = [
    makeFlag(
      "admin_review",
      "paper",
      "An admin must review and approve every extracted question.",
      "error",
    ),
  ];
  const sourceNumbers = Array.from(
    new Set(
      documents.flatMap((document) =>
        document.paper.questions.map((question) => question.sourceNumber),
      ),
    ),
  );

  compareProviderField(documents, "paper.title.en", (document) => document.paper.title?.en, flags);
  compareProviderField(documents, "paper.title.hi", (document) => document.paper.title?.hi, flags);
  compareProviderField(documents, "paper.year", (document) => document.paper.year, flags);
  compareProviderField(
    documents,
    "paper.durationMinutes",
    (document) => document.paper.durationMinutes,
    flags,
  );

  const sectionIds = Array.from(
    new Set(
      documents.flatMap((document) =>
        document.paper.sections.map((section) => section.id),
      ),
    ),
  );
  for (const sectionId of sectionIds) {
    const sectionFrom = (document: ExtractionDocument) =>
      document.paper.sections.find((section) => section.id === sectionId);
    const missingProviders = documents
      .filter((document) => !sectionFrom(document))
      .map((document) => document.provider);
    if (missingProviders.length > 0) {
      addFlag(
        flags,
        makeFlag(
          "missing_field",
          `paper.sections.${sectionId}`,
          `Section is missing from provider output: ${missingProviders.join(", ")}.`,
          "error",
        ),
      );
    }
    for (const [field, getter] of [
      ["subject", (document: ExtractionDocument) => sectionFrom(document)?.subject],
      ["title.en", (document: ExtractionDocument) => sectionFrom(document)?.title?.en],
      ["title.hi", (document: ExtractionDocument) => sectionFrom(document)?.title?.hi],
      ["questionNumbers", (document: ExtractionDocument) => sectionFrom(document)?.questionNumbers],
      ["selectionLimit", (document: ExtractionDocument) => sectionFrom(document)?.selectionLimit ?? null],
    ] as const) {
      compareProviderField(
        documents,
        `paper.sections.${sectionId}.${field}`,
        getter,
        flags,
      );
    }
  }

  for (const sourceNumber of sourceNumbers) {
    if (!paper.questions.some((question) => question.sourceNumber === sourceNumber)) {
      const providerQuestion = documents
        .map((document) => getQuestion(document, sourceNumber))
        .find((question): question is ExtractionQuestion => Boolean(question));

      if (providerQuestion) paper.questions.push(structuredClone(providerQuestion));
    }

    const missingProviders = documents
      .filter((document) => !getQuestion(document, sourceNumber))
      .map((document) => document.provider);

    if (missingProviders.length > 0) {
      addFlag(
        flags,
        makeFlag(
          "missing_field",
          "questions." + sourceNumber,
          `Question is missing from provider output: ${missingProviders.join(", ")}.`,
          "error",
        ),
      );
    }
  }

  for (const sourceNumber of sourceNumbers) {
    compareQuestionField(documents, sourceNumber, "sectionId", (question) => question.sectionId, flags);
    compareQuestionField(documents, sourceNumber, "subject", (question) => question.subject, flags);
    compareQuestionField(documents, sourceNumber, "topic", (question) => question.topic, flags);
    compareQuestionField(documents, sourceNumber, "stem.en", (question) => question.stem?.en, flags);
    compareQuestionField(documents, sourceNumber, "stem.hi", (question) => question.stem?.hi, flags);
    compareQuestionField(documents, sourceNumber, "options", (question) => question.options, flags);
    compareQuestionField(documents, sourceNumber, "solution", (question) => question.solution, flags);
    compareQuestionField(documents, sourceNumber, "disposition", (question) => question.disposition, flags);
    compareQuestionField(documents, sourceNumber, "marking", (question) => question.marking, flags);

    const officialAnswer = options.officialAnswerKey?.[sourceNumber];
    const paperQuestion = paper.questions.find(
      (question) => question.sourceNumber === sourceNumber,
    );

    if (officialAnswer && paperQuestion) {
      paperQuestion.acceptedOptionIds = officialAnswer;
      paperQuestion.answerKeyProvenance = {
        source: "official",
        ...(options.officialAnswerKeyFileId
          ? { reference: options.officialAnswerKeyFileId }
          : {}),
      };
    } else {
      compareQuestionField(
        documents,
        sourceNumber,
        "acceptedOptionIds",
        (question) => question.acceptedOptionIds,
        flags,
      );
    }
  }

  addContentReviewFlags(paper, flags);

  return ReconciledImportSchema.parse({
    schemaVersion: 1,
    status: "review_required",
    providers: documents.map((document) => document.provider),
    paper,
    reviewFlags: flags,
  });
}

export function validateImportForPublish(draft: ReconciledImport): {
  canPublish: boolean;
  issues: PublishIssue[];
} {
  const issues: PublishIssue[] = [];
  const missingPaths = collectMissingPaths(draft.paper);
  const normalized = normalizeOptionalHindiReviewFlags(draft);
  const unresolvedPaths = normalized.reviewFlags
    .filter((flag) => !flag.resolved)
    .map((flag) => flag.path);

  if (missingPaths.length > 0) {
    issues.push({
      code: "missing_required_content",
      message: "Complete every bilingual question, answer key, and solution before publishing.",
      paths: missingPaths,
    });
  }

  if (unresolvedPaths.length > 0) {
    issues.push({
      code: "unresolved_review_flags",
      message: "Resolve every review flag before publishing.",
      paths: unresolvedPaths,
    });
  }

  return {
    canPublish: issues.length === 0,
    issues,
  };
}

export type ReviewDecision = {
  flagId: string;
  resolution: "confirm" | "accept_primary" | "accept_secondary" | "manual_value";
  manualValue?: unknown;
};

export type ReviewFieldEdit = { path: string; value: unknown };

function reviewedValue(paper: ExtractionPaper, path: string): unknown {
  const segments = path.split(".");
  let value: unknown = paper;
  if (segments[0] === "paper") segments.shift();
  for (const segment of segments) {
    if (Array.isArray(value)) {
      value = value.find((item) => item?.id === segment || item?.sourceNumber === segment);
    } else if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[segment];
    } else return undefined;
  }
  return value;
}

function invalidateChangedDecisions(before: ExtractionPaper, draft: ReconciledImport) {
  if (stableValue(before) === stableValue(draft.paper)) return;
  for (const flag of draft.reviewFlags) {
    const path = flag.code === "low_confidence" ? flag.path.split(".confidence")[0] : flag.path;
    if (flag.code === "admin_review" || stableValue(reviewedValue(before, path)) !== stableValue(reviewedValue(draft.paper, path))) {
      flag.resolved = false;
    }
  }
  addContentReviewFlags(draft.paper, draft.reviewFlags);
}

export function applyReviewEdits(
  draftInput: ReconciledImport,
  edits: ReviewFieldEdit[],
) {
  const draft = normalizeOptionalHindiReviewFlags(draftInput);

  for (const edit of edits) {
    if (edit.path === "paper") {
      draft.paper = ExtractionPaperSchema.parse(edit.value);
      continue;
    }
    setReviewedValue(draft, edit.path, edit.value);
  }

  invalidateChangedDecisions(draftInput.paper, draft);
  return ReconciledImportSchema.parse(draft);
}

function setReviewedValue(
  draft: ReconciledImport,
  path: string,
  value: unknown,
) {
  const segments = path.split(".");
  let target: Record<string, unknown>;

  if (segments[0] === "paper") {
    segments.shift();
    target = draft.paper as unknown as Record<string, unknown>;
  } else if (segments[0] === "questions") {
    segments.shift();
    const sourceNumber = segments.shift();
    const question = draft.paper.questions.find(
      (item) => item.sourceNumber === sourceNumber,
    );
    if (!question) throw new Error("Review question path was not found.");
    target = question as unknown as Record<string, unknown>;
  } else {
    throw new Error("Unsupported review path.");
  }

  const finalSegment = segments.pop();
  if (!finalSegment) throw new Error("Review path must identify a field.");

  let current: unknown = target;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const selected = current.find(
        (item) =>
          item &&
          typeof item === "object" &&
          ((item as { id?: unknown }).id === segment ||
            (item as { sourceNumber?: unknown }).sourceNumber === segment),
      );
      if (!selected) throw new Error("Review array item was not found.");
      current = selected;
      continue;
    }

    if (!current || typeof current !== "object") {
      throw new Error("Review path does not identify an object.");
    }
    const record = current as Record<string, unknown>;
    const next = record[segment];
    if (next === undefined) record[segment] = {};
    current = record[segment];
  }

  if (Array.isArray(current)) {
    const index = current.findIndex(
      (item) =>
        item &&
        typeof item === "object" &&
        ((item as { id?: unknown }).id === finalSegment ||
          (item as { sourceNumber?: unknown }).sourceNumber === finalSegment),
    );
    if (index < 0) throw new Error("Review array item was not found.");
    current[index] = value;
  } else if (current && typeof current === "object") {
    (current as Record<string, unknown>)[finalSegment] = value;
  } else {
    throw new Error("Review path does not identify a field.");
  }
}

export function applyReviewDecisions(
  draftInput: ReconciledImport,
  decisions: ReviewDecision[],
) {
  const draft = normalizeOptionalHindiReviewFlags(draftInput);

  for (const decision of decisions) {
    const previousPaper = structuredClone(draft.paper);
    const flag = draft.reviewFlags.find((item) => item.id === decision.flagId);
    if (!flag) throw new Error("Review flag was not found.");
    if (
      decision.resolution === "confirm" &&
      (flag.code === "missing_field" || flag.code === "invalid_answer_key")
    ) {
      throw new Error("Missing required values need a valid replacement.");
    }

    if (decision.resolution !== "confirm") {
      let value = decision.manualValue;
      if (decision.resolution === "accept_primary") {
        value = flag.providerValues?.[draft.providers[0]];
      } else if (decision.resolution === "accept_secondary") {
        value = flag.providerValues?.[draft.providers[1]];
      }
      if (value === undefined) {
        throw new Error("The selected review resolution has no value.");
      }
      setReviewedValue(draft, flag.path, value);
    }

    if (flag.code === "missing_field" || flag.code === "invalid_answer_key") {
      const missing = collectMissingPaths(draft.paper).map((path) =>
        path.replace(/\.invalid$/, ""),
      );
      if (
        missing.some(
          (path) =>
            path === flag.path ||
            path.startsWith(flag.path + ".") ||
            flag.path.startsWith(path + "."),
        )
      ) {
        throw new Error("Missing required values need a valid replacement.");
      }
    }

    invalidateChangedDecisions(previousPaper, draft);
    flag.resolved = true;
  }

  return ReconciledImportSchema.parse(draft);
}

const sectionTitles = {
  physics: { en: "Physics", hi: "भौतिक विज्ञान" },
  chemistry: { en: "Chemistry", hi: "रसायन विज्ञान" },
  biology: { en: "Biology", hi: "जीव विज्ञान" },
} as const;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

export function buildPaperVersionFromImport(
  draft: ReconciledImport,
  metadata: {
    id: string;
    paperId: string;
    revision: number;
    publishedAt: string;
    pattern?: "original" | "current";
  },
): PaperVersion {
  const validation = validateImportForPublish(draft);

  if (!validation.canPublish) {
    throw new Error("Import is not ready to publish.");
  }

  const questions = draft.paper.questions.map((question) => ({
    id: metadata.id + ":q:" + question.sourceNumber,
    sectionId: question.sectionId!,
    subject: question.subject!,
    topic: question.topic!,
    stem: {
      en: question.stem!.en!,
      ...(question.stem?.hi ? { hi: question.stem.hi } : {}),
    },
    options: question.options.map((option) => ({
      id: option.id,
      text: {
        en: option.text!.en!,
        ...(option.text?.hi ? { hi: option.text.hi } : {}),
      },
    })),
    acceptedOptionIds: question.acceptedOptionIds,
    solution: {
      en: question.solution!.en!,
      ...(question.solution?.hi ? { hi: question.solution.hi } : {}),
    },
    answerKeyProvenance: question.answerKeyProvenance,
    disposition: question.disposition,
    marking: question.marking,
  }));
  const sections = draft.paper.sections.length > 0
    ? draft.paper.sections.map((section) => ({
        id: section.id,
        subject: section.subject,
        title: {
          en: section.title!.en!,
          ...(section.title?.hi ? { hi: section.title.hi } : {}),
        },
        questionIds: section.questionNumbers.map(
          (sourceNumber) => metadata.id + ":q:" + sourceNumber,
        ),
        ...(section.selectionLimit
          ? { selectionLimit: section.selectionLimit }
          : {}),
      }))
    : Array.from(new Set(questions.map((question) => question.sectionId))).map(
        (sectionId) => {
          const sectionQuestions = questions.filter(
            (question) => question.sectionId === sectionId,
          );
          const subject = sectionQuestions[0].subject;

          return {
            id: sectionId,
            subject,
            title: sectionTitles[subject],
            questionIds: sectionQuestions.map((question) => question.id),
          };
        },
      );

  return deepFreeze(PaperVersionSchema.parse({
    schemaVersion: 1,
    id: metadata.id,
    paperId: metadata.paperId,
    revision: metadata.revision,
    pattern: metadata.pattern ?? "original",
    status: "published",
    title: {
      en: draft.paper.title!.en!,
      ...(draft.paper.title?.hi ? { hi: draft.paper.title.hi } : {}),
    },
    durationMinutes: draft.paper.durationMinutes!,
    publishedAt: metadata.publishedAt,
    sections,
    questions,
  }));
}

export function buildPublishedPaperVersionsFromImport(
  draft: ReconciledImport,
  metadata: {
    paperId: string;
    originalId: string;
    originalRevision: number;
    currentId: string;
    currentRevision: number;
    publishedAt: string;
  },
): { original: PaperVersion; current: PaperVersion } {
  return {
    original: buildPaperVersionFromImport(draft, {
      id: metadata.originalId,
      paperId: metadata.paperId,
      revision: metadata.originalRevision,
      pattern: "original",
      publishedAt: metadata.publishedAt,
    }),
    current: buildPaperVersionFromImport(draft, {
      id: metadata.currentId,
      paperId: metadata.paperId,
      revision: metadata.currentRevision,
      pattern: "current",
      publishedAt: metadata.publishedAt,
    }),
  };
}
