import {
  PaperVersionSchema,
  type PaperVersion,
} from "@/features/exam/domain";
import {
  ReconciledImportSchema,
  type ExtractionDocument,
  type ExtractionPaper,
  type ExtractionQuestion,
  type ReconciledImport,
  type ReviewFlag,
} from "@/features/imports/schema";

const confidenceThreshold = 0.8;

type ReconciliationOptions = {
  officialAnswerKey?: Record<string, string[]>;
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
  if (!paper.title?.hi) paths.push("paper.title.hi");
  if (!paper.year) paths.push("paper.year");
  if (!paper.durationMinutes) paths.push("paper.durationMinutes");
  if (paper.questions.length === 0) paths.push("paper.questions");

  for (const question of paper.questions) {
    const base = "questions." + question.sourceNumber;

    if (!question.sectionId) paths.push(base + ".sectionId");
    if (!question.subject) paths.push(base + ".subject");
    if (!question.topic) paths.push(base + ".topic");
    if (!question.stem?.en) paths.push(base + ".stem.en");
    if (!question.stem?.hi) paths.push(base + ".stem.hi");
    if (question.options.length < 2) paths.push(base + ".options");

    for (const option of question.options) {
      if (!option.text.en) paths.push(base + ".options." + option.id + ".text.en");
      if (!option.text.hi) paths.push(base + ".options." + option.id + ".text.hi");
    }

    if (question.acceptedOptionIds.length === 0) {
      paths.push(base + ".acceptedOptionIds");
    }

    const optionIds = new Set(question.options.map((option) => option.id));
    if (question.acceptedOptionIds.some((optionId) => !optionIds.has(optionId))) {
      paths.push(base + ".acceptedOptionIds.invalid");
    }

    if (!question.solution?.en) paths.push(base + ".solution.en");
    if (!question.solution?.hi) paths.push(base + ".solution.hi");
  }

  return paths;
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
    const confidenceEntries = Object.entries(question.confidence) as Array<
      [keyof typeof question.confidence, number | undefined]
    >;

    for (const [field, confidence] of confidenceEntries) {
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

  for (const sourceNumber of sourceNumbers) {
    compareQuestionField(documents, sourceNumber, "stem.en", (question) => question.stem?.en, flags);
    compareQuestionField(documents, sourceNumber, "stem.hi", (question) => question.stem?.hi, flags);
    compareQuestionField(documents, sourceNumber, "options", (question) => question.options, flags);
    compareQuestionField(documents, sourceNumber, "solution", (question) => question.solution, flags);

    const officialAnswer = options.officialAnswerKey?.[sourceNumber];
    const paperQuestion = paper.questions.find(
      (question) => question.sourceNumber === sourceNumber,
    );

    if (officialAnswer && paperQuestion) {
      paperQuestion.acceptedOptionIds = officialAnswer;
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
  const unresolvedPaths = draft.reviewFlags
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

const sectionTitles = {
  physics: { en: "Physics", hi: "भौतिक विज्ञान" },
  chemistry: { en: "Chemistry", hi: "रसायन विज्ञान" },
  biology: { en: "Biology", hi: "जीव विज्ञान" },
} as const;

export function buildPaperVersionFromImport(
  draft: ReconciledImport,
  metadata: {
    id: string;
    paperId: string;
    revision: number;
    publishedAt: string;
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
      hi: question.stem!.hi!,
    },
    options: question.options.map((option) => ({
      id: option.id,
      text: {
        en: option.text.en!,
        hi: option.text.hi!,
      },
    })),
    acceptedOptionIds: question.acceptedOptionIds,
    solution: {
      en: question.solution!.en!,
      hi: question.solution!.hi!,
    },
    disposition: "standard" as const,
    marking: {
      correct: 4,
      incorrect: -1,
      unattempted: 0,
    },
  }));
  const sectionIds = Array.from(new Set(questions.map((question) => question.sectionId)));
  const sections = sectionIds.map((sectionId) => {
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
  });

  return PaperVersionSchema.parse({
    schemaVersion: 1,
    id: metadata.id,
    paperId: metadata.paperId,
    revision: metadata.revision,
    status: "published",
    title: {
      en: draft.paper.title!.en!,
      hi: draft.paper.title!.hi!,
    },
    durationMinutes: draft.paper.durationMinutes!,
    publishedAt: metadata.publishedAt,
    sections,
    questions,
  });
}
