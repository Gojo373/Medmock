"use client";

import { AlertTriangle, CheckCircle2, Languages, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
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
    switchLanguage: "Switch review language",
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

function providerLabel(provider: string) {
  if (provider === "openai") return "OpenAI";
  if (provider === "gemini") return "Gemini";
  return provider;
}

function formatReviewValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function AdminImportReview({ importId }: { importId: string }) {
  const [locale, setLocale] = useState<keyof typeof copy>("en");
  const [document, setDocument] = useState<ReconciledImport>();
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
          <p className="eyebrow">MedMock import review</p>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
        </div>
        <Button
          aria-label={text.switchLanguage}
          onClick={() => setLocale((value) => (value === "en" ? "hi" : "en"))}
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
          <section aria-label="Review flags" className="admin-review-flags">
            {document.reviewFlags.map((flag) => (
              <GlassPanel className="admin-review-flag" key={flag.id}>
                <div className="admin-review-flag__heading">
                  {flag.resolved ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <AlertTriangle aria-hidden="true" />
                  )}
                  <div>
                    <strong>{flag.path}</strong>
                    <span>{flag.resolved ? text.resolved : text.unresolved}</span>
                  </div>
                </div>
                <p>{flag.message}</p>

                {flag.providerValues && (
                  <div className="admin-review-values">
                    {document.providers.map((provider, index) => (
                      <div key={provider}>
                        <strong>{providerLabel(provider)}</strong>
                        <pre>{formatReviewValue(flag.providerValues?.[provider])}</pre>
                        {!flag.resolved && flag.providerValues?.[provider] !== undefined && (
                          <Button
                            aria-label={`Use ${providerLabel(provider)} value`}
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
                        aria-label={`Manual value for ${flag.path}`}
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
