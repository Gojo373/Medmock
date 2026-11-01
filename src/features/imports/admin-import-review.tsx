"use client";

import { AlertTriangle, CheckCircle2, Languages, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useLocale } from "@/features/localization/locale-provider";
import {
  ReconciledImportSchema,
  type ReconciledImport,
  type ReviewFlag,
} from "@/features/imports/schema";

const copy = {
  en: {
    title: "Review every extracted field",
    subtitle: "Compare provider values, resolve every flag, then approve two immutable versions.",
    switchLanguage: "Switch review language",
    unresolved: "Needs decision",
    resolved: "Resolved",
    confirm: "Confirm reviewed value",
    manual: "Apply manual value",
    ready: "Ready for explicit publication approval.",
    approve: "I reviewed every flag and approve publication.",
    publish: "Publish both immutable versions",
    paperId: "Paper identifier",
    originalRevision: "Original revision",
    currentRevision: "Current revision",
    loading: "Loading review document…",
    processing: "Extraction is still running. This review will refresh automatically.",
    error: "The review document could not be loaded.",
    decisionError: "Review decision could not be saved. Please retry.",
  },
  hi: {
    title: "हर निकाले गए फ़ील्ड की समीक्षा करें",
    subtitle: "प्रदाता मानों की तुलना करें, हर फ़्लैग हल करें, फिर दो स्थिर संस्करण स्वीकृत करें।",
    switchLanguage: "समीक्षा की भाषा बदलें",
    unresolved: "निर्णय आवश्यक",
    resolved: "हल किया गया",
    confirm: "समीक्षित मान की पुष्टि करें",
    manual: "मैनुअल मान लागू करें",
    ready: "स्पष्ट प्रकाशन स्वीकृति के लिए तैयार।",
    approve: "मैंने हर फ़्लैग की समीक्षा की है और प्रकाशन स्वीकृत करता/करती हूँ।",
    publish: "दोनों स्थिर संस्करण प्रकाशित करें",
    paperId: "पेपर पहचान",
    originalRevision: "मूल संशोधन",
    currentRevision: "वर्तमान संशोधन",
    loading: "समीक्षा दस्तावेज़ लोड हो रहा है…",
    processing: "एक्सट्रैक्शन अभी चल रहा है। यह समीक्षा अपने आप रीफ़्रेश होगी।",
    error: "समीक्षा दस्तावेज़ लोड नहीं हो सका।",
    decisionError: "समीक्षा निर्णय सहेजा नहीं जा सका। फिर प्रयास करें।",
  },
} as const;

const flagExplanations = {
  en: {
    admin_review: "An admin must review and approve every extracted question.",
    provider_conflict: "Providers disagree on this field; choose the reviewed value.",
    low_confidence: "This extracted field needs a human confidence check.",
    missing_field: "Required reviewed content is missing or invalid.",
    invalid_answer_key: "The answer key references a missing or invalid option; check the reviewed answer.",
  },
  hi: {
    admin_review: "एडमिन को हर निकाले गए प्रश्न की समीक्षा और स्वीकृति देनी होगी।",
    provider_conflict: "इस फ़ील्ड पर प्रदाताओं में मतभेद है। समीक्षित मान चुनें।",
    low_confidence: "निकाले गए इस फ़ील्ड के विश्वास स्तर की मानव जाँच आवश्यक है।",
    missing_field: "आवश्यक समीक्षित सामग्री अनुपलब्ध या अमान्य है।",
    invalid_answer_key: "उत्तर कुंजी में अनुपलब्ध या अमान्य विकल्प है। समीक्षित उत्तर की जाँच करें।",
  },
} satisfies Record<"en" | "hi", Record<ReviewFlag["code"], string>>;

function providerLabel(provider: string) {
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  return provider;
}

function formatReviewValue(value: unknown, depth = 0): ReactNode {
  if (typeof value === "string" && depth === 0) return value;
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "—";

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((entry, index): [string, unknown] => [String(index), entry])
    : Object.entries(value);
  const opening = isArray ? "[" : "{";
  const closing = isArray ? "]" : "}";
  if (entries.length === 0) return opening + closing;

  return <>
    {opening}
    {entries.map(([key, entry], index) => (
      <Fragment key={key}>
        {"\n" + "  ".repeat(depth + 1)}
        {!isArray && `${JSON.stringify(key)}: `}
        <span lang={key === "en" || key === "hi" ? key : undefined}>
          {formatReviewValue(entry, depth + 1)}
        </span>
        {index < entries.length - 1 ? "," : ""}
      </Fragment>
    ))}
    {"\n" + "  ".repeat(depth) + closing}
  </>;
}

export function AdminImportReview({ importId }: { importId: string }) {
  const { locale, toggleLocale } = useLocale();
  const [document, setDocument] = useState<ReconciledImport>();
  const [sources, setSources] = useState<Array<{
    kind: "paper" | "answer_key" | "solution";
    fileName: string;
    downloadUrl: string;
  }>>([]);
  const [paperEditor, setPaperEditor] = useState("");
  const [canPublish, setCanPublish] = useState(false);
  const [loadState, setLoadState] = useState<"error" | "loading" | "processing" | "ready">("loading");
  const [pendingFlagId, setPendingFlagId] = useState<string>();
  const [decisionError, setDecisionError] = useState(false);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState(false);
  const [paperId, setPaperId] = useState("neet-paper");
  const [originalRevision, setOriginalRevision] = useState(1);
  const [currentRevision, setCurrentRevision] = useState(2);
  const [publishState, setPublishState] = useState<"error" | "idle" | "published" | "publishing">("idle");
  const text = copy[locale];

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    async function load() {
      try {
        const response = await fetch(`/api/imports/${importId}/review`, {
          credentials: "same-origin",
        });
        if (response.ok) {
          const payload = await response.json();
          if (cancelled) return;
          setDocument(ReconciledImportSchema.parse(payload.document));
          setSources(Array.isArray(payload.sources) ? payload.sources : []);
          setPaperEditor(JSON.stringify(payload.document.paper, null, 2));
          setCanPublish(Boolean(payload.canPublish));
          setLoadState("ready");
          return;
        }

        if (response.status === 404) {
          const statusResponse = await fetch(`/api/imports/${importId}`, {
            credentials: "same-origin",
          });
          if (statusResponse.ok) {
            const statusPayload = await statusResponse.json();
            if (["uploading", "uploaded", "extracting"].includes(statusPayload.status)) {
              if (cancelled) return;
              setLoadState("processing");
              retryTimer = window.setTimeout(() => void load(), 3_000);
              return;
            }
          }
        }
        throw new Error("Review load failed");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [importId]);

  async function decide(
    flag: ReviewFlag,
    resolution: "confirm" | "accept_primary" | "accept_secondary" | "manual_value",
  ) {
    let manualValue: unknown;
    if (resolution === "manual_value") {
      const raw = manualValues[flag.id]?.trim();
      if (!raw) return;
      try {
        manualValue = JSON.parse(raw);
      } catch {
        manualValue = raw;
      }
    }

    setDecisionError(false);
    setPendingFlagId(flag.id);
    try {
      const response = await fetch(`/api/imports/${importId}/review`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: [
            {
              flagId: flag.id,
              resolution,
              ...(resolution === "manual_value" ? { manualValue } : {}),
            },
          ],
        }),
      });
      if (!response.ok) throw new Error("Decision failed");
      const payload = await response.json();
      setDocument(ReconciledImportSchema.parse(payload.reviewed));
      setCanPublish(Boolean(payload.canPublish));
    } catch {
      setDecisionError(true);
    } finally {
      setPendingFlagId(undefined);
    }
  }

  async function saveCompletePaper() {
    let paper: unknown;
    try {
      paper = JSON.parse(paperEditor);
    } catch {
      setDecisionError(true);
      return;
    }

    setDecisionError(false);
    try {
      const response = await fetch(`/api/imports/${importId}/review`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edits: [{ path: "paper", value: paper }] }),
      });
      if (!response.ok) throw new Error("Edit failed");
      const payload = await response.json();
      const reviewed = ReconciledImportSchema.parse(payload.reviewed);
      setDocument(reviewed);
      setPaperEditor(JSON.stringify(reviewed.paper, null, 2));
      setCanPublish(Boolean(payload.canPublish));
    } catch {
      setDecisionError(true);
    }
  }

  async function publish() {
    if (!approved || !canPublish) return;
    setPublishState("publishing");
    try {
      const response = await fetch(`/api/imports/${importId}/publish`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          approved: true,
          paperId,
          originalRevision,
          currentRevision,
        }),
      });
      if (!response.ok) throw new Error("Publish failed");
      setPublishState("published");
    } catch {
      setPublishState("error");
    }
  }

  return (
    <main className="admin-review-shell">
      <header className="admin-review-heading">
        <div>
          <p className="eyebrow">{locale === "hi" ? "MedMock इम्पोर्ट समीक्षा" : "MedMock import review"}</p>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
          <Link href="/admin/imports">{locale === "hi" ? "इम्पोर्ट पर वापस जाएँ" : "Return to imports"}</Link>
        </div>
        <Button
          aria-label={text.switchLanguage}
          onClick={toggleLocale}
          tone="ghost"
        >
          <Languages aria-hidden="true" size={17} />
          {locale === "en" ? "हिंदी" : "English"}
        </Button>
      </header>

      {loadState === "loading" && <p role="status">{text.loading}</p>}
      {loadState === "processing" && <p role="status">{text.processing}</p>}
      {loadState === "error" && <p role="alert">{text.error}</p>}
      {decisionError && <p role="alert">{text.decisionError}</p>}

      {document && (
        <div className="admin-review-layout">
          <section aria-label={locale === "hi" ? "समीक्षित पेपर सामग्री" : "Reviewed paper content"} className="admin-review-content">
            <GlassPanel>
              <h2>{locale === "en" ? "Source material" : "स्रोत सामग्री"}</h2>
              {sources.map((source) => (
                <a
                  href={source.downloadUrl}
                  key={`${source.kind}:${source.fileName}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {locale === "hi" ? source.kind === "paper" ? "प्रश्न पत्र खोलें" : source.kind === "answer_key" ? "उत्तर कुंजी खोलें" : "समाधान फ़ाइल खोलें" : source.kind === "paper"
                    ? "Open question paper"
                    : source.kind === "answer_key"
                      ? "Open answer key"
                      : "Open solution file"}
                </a>
              ))}
            </GlassPanel>
            <GlassPanel>
              <h2>{document.paper.title?.[locale] ?? (locale === "hi" ? "शीर्षक रहित पेपर" : "Untitled paper")}</h2>
              <p>{document.paper.durationMinutes ?? "—"} {locale === "hi" ? "मिनट" : "minutes"} · {document.paper.year ?? "—"}</p>
              {document.paper.sections.map((section) => (
                <section key={section.id}>
                  <h3><span lang="en">{section.title.en ?? "—"}</span> / <span lang="hi">{section.title.hi ?? "—"}</span></h3>
                  <p lang="en">{section.subject} · {section.questionNumbers.join(", ")}</p>
                </section>
              ))}
              {document.paper.questions.map((question) => (
                <article key={question.sourceNumber}>
                  <h3>{locale === "hi" ? "प्रश्न" : "Question"} {question.sourceNumber}</h3>
                  <p lang="en">{question.stem?.en ?? "—"}</p>
                  <p lang="hi">{question.stem?.hi ?? "—"}</p>
                  <p lang="en">{question.subject ?? "—"} · {question.topic ?? "—"} · {question.sectionId ?? "—"}</p>
                  <ul>
                    {question.options.map((option) => (
                      <li key={option.id}>
                        {option.id}. <span lang="en">{option.text?.en ?? "—"}</span> / <span lang="hi">{option.text?.hi ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                  <p><span lang="en">{question.solution?.en ?? "—"}</span> / <span lang="hi">{question.solution?.hi ?? "—"}</span></p>
                  <p>{locale === "hi" ? "स्वीकृत उत्तर" : "Accepted"}: {question.acceptedOptionIds.join(", ") || "—"}</p>
                  <p>{locale === "hi" ? "अंक योजना" : "Marking"}: +{question.marking.correct} / {question.marking.incorrect}</p>
                </article>
              ))}
              <label>
                <span>{locale === "hi" ? "पूरा समीक्षित पेपर JSON" : "Complete reviewed paper JSON"}</span>
                <textarea
                  aria-label={locale === "hi" ? "पूरा समीक्षित पेपर JSON" : "Complete reviewed paper JSON"}
                  lang="en"
                  onChange={(event) => setPaperEditor(event.target.value)}
                  value={paperEditor}
                />
              </label>
              <Button onClick={saveCompletePaper} tone="secondary">
                {locale === "hi" ? "पेपर के सभी बदलाव सहेजें" : "Save complete paper edits"}
              </Button>
            </GlassPanel>
          </section>
          <section aria-label={locale === "hi" ? "समीक्षा फ़्लैग" : "Review flags"} className="admin-review-flags">
            {document.reviewFlags.map((flag) => (
              <GlassPanel className="admin-review-flag" key={flag.id}>
                <div className="admin-review-flag__heading">
                  {flag.resolved ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <AlertTriangle aria-hidden="true" />
                  )}
                  <div>
                    <strong lang="en">{flag.path}</strong>
                    <span>{flag.resolved ? text.resolved : text.unresolved}</span>
                  </div>
                </div>
                <p lang={locale}>{flagExplanations[locale][flag.code]}</p>

                {flag.providerValues && (
                  <div className="admin-review-values">
                    {document.providers.map((provider, index) => (
                      <div key={provider}>
                        <strong>{providerLabel(provider)}</strong>
                        <pre lang={flag.path.endsWith(".hi") ? "hi" : "en"}>{formatReviewValue(flag.providerValues?.[provider])}</pre>
                        {!flag.resolved && flag.providerValues?.[provider] !== undefined && (
                          <Button
                            aria-label={locale === "hi" ? `${providerLabel(provider)} का मान चुनें` : `Use ${providerLabel(provider)} value`}
                            disabled={pendingFlagId === flag.id}
                            onClick={() =>
                              decide(flag, index === 0 ? "accept_primary" : "accept_secondary")
                            }
                            tone="secondary"
                          >
                            {locale === "en" ? "Use value" : "मान चुनें"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!flag.resolved && (
                  <div className="admin-review-actions">
                    <Button
                      disabled={pendingFlagId === flag.id}
                      onClick={() => decide(flag, "confirm")}
                      tone="ghost"
                    >
                      {text.confirm}
                    </Button>
                    <label>
                      <span>{locale === "en" ? "Manual JSON or text" : "मैनुअल JSON या पाठ"}</span>
                      <textarea
                        aria-label={locale === "hi" ? `${flag.path} के लिए मैनुअल मान` : `Manual value for ${flag.path}`}
                        onChange={(event) =>
                          setManualValues((values) => ({
                            ...values,
                            [flag.id]: event.target.value,
                          }))
                        }
                        value={manualValues[flag.id] ?? ""}
                      />
                    </label>
                    <Button
                      disabled={pendingFlagId === flag.id || !manualValues[flag.id]?.trim()}
                      onClick={() => decide(flag, "manual_value")}
                      tone="secondary"
                    >
                      {text.manual}
                    </Button>
                  </div>
                )}
              </GlassPanel>
            ))}
          </section>

          <aside>
            <GlassPanel className="admin-review-publish">
              <ShieldCheck aria-hidden="true" />
              {canPublish && <p role="status">{text.ready}</p>}
              <label>
                <span>{text.paperId}</span>
                <input onChange={(event) => setPaperId(event.target.value)} value={paperId} />
              </label>
              <label>
                <span>{text.originalRevision}</span>
                <input
                  min="1"
                  onChange={(event) => setOriginalRevision(Number(event.target.value))}
                  type="number"
                  value={originalRevision}
                />
              </label>
              <label>
                <span>{text.currentRevision}</span>
                <input
                  min="1"
                  onChange={(event) => setCurrentRevision(Number(event.target.value))}
                  type="number"
                  value={currentRevision}
                />
              </label>
              <label>
                <input
                  checked={approved}
                  disabled={!canPublish}
                  onChange={(event) => setApproved(event.target.checked)}
                  type="checkbox"
                />
                <span>{text.approve}</span>
              </label>
              <Button
                disabled={
                  !canPublish ||
                  !approved ||
                  !paperId.trim() ||
                  originalRevision === currentRevision ||
                  publishState === "publishing"
                }
                onClick={publish}
              >
                {text.publish}
              </Button>
              {publishState === "published" && (
                <p role="status">{locale === "en" ? "Published immutably." : "स्थिर रूप से प्रकाशित।"}</p>
              )}
              {publishState === "error" && (
                <p role="alert">{locale === "en" ? "Publication failed." : "प्रकाशन विफल।"}</p>
              )}
            </GlassPanel>
          </aside>
        </div>
      )}
    </main>
  );
}
