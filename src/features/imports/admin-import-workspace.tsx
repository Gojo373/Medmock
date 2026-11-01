"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileKey2,
  FileText,
  Files,
  GitCompareArrows,
  LibraryBig,
  ListChecks,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ChangeEvent } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useLocale } from "@/features/localization/locale-provider";
import type { ProviderSelection } from "@/features/imports/schema";

const copy = {
  en: {
    eyebrow: "AI-assisted import studio",
    title: "Turn a paper into a reviewed CBT",
    description:
      "Upload the paper, answer key and solutions. MedMock structures every question, compares providers and holds publication until you approve the review.",
    uploadTitle: "Upload question paper",
    uploadHint: "PDF, JPG or PNG",
    uploadDetail: "Up to 50 MB · scanned and bilingual papers supported",
    choose: "Choose paper files",
    providerTitle: "Choose extraction intelligence",
    providerDetail: "Run one provider or compare both for higher-confidence review.",
    supportTitle: "Add trusted source files",
    answerKey: "Official answer key",
    answerKeyDetail: "Overrides every model suggestion",
    solutions: "Solution booklet",
    solutionsDetail: "Used to draft reviewed explanations",
    safety: "Review gate",
    safetyTitle: "Nothing publishes without your approval.",
    safetyDetail:
      "Conflicts, missing translations, weak confidence and invalid answer keys are surfaced question by question.",
    next: "Start reviewed extraction",
    openReview: "Open import review",
    language: "हिंदी",
  },
  hi: {
    eyebrow: "AI-सहायित इम्पोर्ट स्टूडियो",
    title: "पेपर को समीक्षित CBT में बदलें",
    description:
      "पेपर, उत्तर कुंजी और समाधान अपलोड करें। MedMock हर प्रश्न को संरचित करता है, प्रदाताओं की तुलना करता है और आपकी समीक्षा से पहले प्रकाशित नहीं करता।",
    uploadTitle: "प्रश्न पत्र अपलोड करें",
    uploadHint: "PDF, JPG या PNG",
    uploadDetail: "50 MB तक · स्कैन और द्विभाषी पेपर समर्थित",
    choose: "पेपर फ़ाइल चुनें",
    providerTitle: "एक्सट्रैक्शन इंटेलिजेंस चुनें",
    providerDetail: "एक प्रदाता चलाएँ या अधिक विश्वसनीय समीक्षा के लिए दोनों की तुलना करें।",
    supportTitle: "विश्वसनीय स्रोत फ़ाइलें जोड़ें",
    answerKey: "आधिकारिक उत्तर कुंजी",
    answerKeyDetail: "हर मॉडल सुझाव से ऊपर",
    solutions: "समाधान पुस्तिका",
    solutionsDetail: "समीक्षित व्याख्याओं का आधार",
    safety: "समीक्षा द्वार",
    safetyTitle: "आपकी स्वीकृति के बिना कुछ प्रकाशित नहीं होता।",
    safetyDetail:
      "मतभेद, अनुपलब्ध अनुवाद, कम विश्वास और अमान्य उत्तर हर प्रश्न पर दिखाए जाते हैं।",
    next: "समीक्षित एक्सट्रैक्शन शुरू करें",
    openReview: "इम्पोर्ट समीक्षा खोलें",
    language: "English",
  },
} as const;

const providers: Array<{
  id: ProviderSelection;
  title: string;
  subtitle: string;
  label: string;
  accent: string;
}> = [
  {
    id: "openai",
    title: "OpenAI",
    subtitle: "Responses · vision + structured output",
    label: "Use OpenAI",
    accent: "openai",
  },
  {
    id: "gemini",
    title: "Gemini",
    subtitle: "Document understanding · JSON schema",
    label: "Use Gemini",
    accent: "gemini",
  },
  {
    id: "both",
    title: "Both",
    subtitle: "Compare fields and flag disagreements",
    label: "Use both providers",
    accent: "both",
  },
];

export function AdminImportWorkspace({
  availableProviders = ["openai", "gemini"],
}: {
  availableProviders?: Array<"openai" | "gemini">;
}) {
  const enabledProviders = providers.filter((item) =>
    item.id === "both"
      ? availableProviders.includes("openai") && availableProviders.includes("gemini")
      : availableProviders.includes(item.id),
  );
  const [provider, setProvider] = useState<ProviderSelection>(
    enabledProviders.some((item) => item.id === "both")
      ? "both"
      : enabledProviders[0]?.id ?? "gemini",
  );
  const { locale, toggleLocale } = useLocale();
  const [paperFile, setPaperFile] = useState<File>();
  const [answerKeyFile, setAnswerKeyFile] = useState<File>();
  const [solutionFile, setSolutionFile] = useState<File>();
  const [importId, setImportId] = useState<string>();
  const [importStatus, setImportStatus] = useState<"error" | "idle" | "queued" | "uploading">("idle");
  const paperInput = useRef<HTMLInputElement>(null);
  const answerKeyInput = useRef<HTMLInputElement>(null);
  const solutionInput = useRef<HTMLInputElement>(null);
  const currentCopy = copy[locale];

  function onPaperSelected(event: ChangeEvent<HTMLInputElement>) {
    setPaperFile(event.target.files?.[0]);
  }

  async function startImport() {
    if (!paperFile || enabledProviders.length === 0) return;
    setImportStatus("uploading");
    const sources = [
      { file: paperFile, kind: "paper" as const },
      ...(answerKeyFile
        ? [{ file: answerKeyFile, kind: "answer_key" as const }]
        : []),
      ...(solutionFile
        ? [{ file: solutionFile, kind: "solution" as const }]
        : []),
    ];

    try {
      const registrationResponse = await fetch("/api/imports/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerSelection: provider,
          files: sources.map(({ file, kind }) => ({
            kind,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
          })),
        }),
      });
      if (!registrationResponse.ok) throw new Error("Import registration failed");
      const payload = await registrationResponse.json();
      if (typeof payload.importId !== "string" || !payload.importId) {
        throw new Error("Import response was invalid");
      }

      const uploadByKind = new Map<string, { uploadUrl: string }>(
        (Array.isArray(payload.uploads) ? payload.uploads : []).map(
          (upload: { kind: string; uploadUrl: string }) => [upload.kind, upload],
        ),
      );
      for (const source of sources) {
        const upload = uploadByKind.get(source.kind);
        if (!upload?.uploadUrl) throw new Error("Signed upload was missing");
        const uploadResponse = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "content-type": source.file.type },
          body: source.file,
        });
        if (!uploadResponse.ok) throw new Error("Storage upload failed");
      }

      const finalizeResponse = await fetch(
        `/api/imports/upload/${payload.importId}/complete`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!finalizeResponse.ok) throw new Error("Import finalization failed");
      setImportId(payload.importId);
      setImportStatus("queued");
    } catch {
      setImportId(undefined);
      setImportStatus("error");
    }
  }

  return (
    <main className="admin-shell">
      <div aria-hidden="true" className="admin-aurora admin-aurora--one" />
      <div aria-hidden="true" className="admin-aurora admin-aurora--two" />

      <header className="admin-topbar">
        <BrandMark compact />
        <div className="admin-topbar__trail">
          <span>{locale === "hi" ? "एडमिन" : "Admin"}</span>
          <ChevronRight aria-hidden="true" size={15} />
          <strong>{locale === "en" ? "Paper imports" : "पेपर इम्पोर्ट"}</strong>
        </div>
        <div className="admin-topbar__actions">
          <span className="admin-live-chip">
            <i />
            {locale === "en" ? "Systems healthy" : "सिस्टम सक्रिय"}
          </span>
          <Button
            aria-label={locale === "hi" ? "एडमिन की भाषा बदलें" : "Switch admin language"}
            className="admin-language"
            onClick={toggleLocale}
            tone="ghost"
          >
            {currentCopy.language}
          </Button>
          <ThemeToggle />
          <div className="admin-avatar" title={locale === "hi" ? "MedMock प्रशासक" : "MedMock administrator"}>
            DS
          </div>
        </div>
      </header>

      <div className="admin-frame">
        <aside className="admin-sidebar">
          <nav aria-label={locale === "hi" ? "एडमिन नेविगेशन" : "Admin navigation"}>
            <Link aria-current="page" className="is-active" href="/admin/imports">
              <UploadCloud aria-hidden="true" /> {locale === "hi" ? "पेपर इम्पोर्ट" : "Paper imports"}
            </Link>
            <Link href="/#papers"><LibraryBig aria-hidden="true" /> {locale === "hi" ? "पेपर लाइब्रेरी" : "Paper library"}</Link>
            <Link href="/dashboard"><ListChecks aria-hidden="true" /> {locale === "hi" ? "मेरा प्रयास इतिहास" : "My attempt history"}</Link>
            {importId && <Link href={`/admin/imports/${importId}`}><ClipboardCheck aria-hidden="true" /> {locale === "hi" ? "वर्तमान इम्पोर्ट समीक्षा" : "Review current import"}</Link>}
          </nav>
          <div className="admin-sidebar__bottom">
            <div className="capacity-card">
              <Sparkles aria-hidden="true" />
              <strong>500 {locale === "hi" ? "एकसाथ प्रयास" : "concurrent"}</strong>
              <span>{locale === "hi" ? "लॉन्च क्षमता लक्ष्य" : "Launch capacity target"}</span>
              <div><i /></div>
            </div>
          </div>
        </aside>

        <section className="admin-content">
          <div className="admin-content__heading">
            <div>
              <p className="eyebrow">{currentCopy.eyebrow}</p>
              <h1>{currentCopy.title}</h1>
              <p>{currentCopy.description}</p>
            </div>
            <div className="admin-heading-stat">
              <span>24</span>
              <small>{locale === "en" ? "published papers" : "प्रकाशित पेपर"}</small>
            </div>
          </div>

          <div className="import-stepper" aria-label={locale === "hi" ? "इम्पोर्ट प्रगति" : "Import progress"}>
            <div className="is-active">
              <span>1</span>
              <strong>{locale === "en" ? "Sources" : "स्रोत"}</strong>
              <small>{locale === "en" ? "Upload trusted files" : "विश्वसनीय फ़ाइलें"}</small>
            </div>
            <i />
            <div>
              <span>2</span>
              <strong>{locale === "en" ? "Extract" : "एक्सट्रैक्ट"}</strong>
              <small>{locale === "en" ? "Structure with AI" : "AI से संरचना"}</small>
            </div>
            <i />
            <div>
              <span>3</span>
              <strong>{locale === "en" ? "Review" : "समीक्षा"}</strong>
              <small>{locale === "en" ? "Resolve every flag" : "हर फ़्लैग हल करें"}</small>
            </div>
            <i />
            <div>
              <span>4</span>
              <strong>{locale === "en" ? "Publish" : "प्रकाशित"}</strong>
              <small>{locale === "en" ? "Create immutable version" : "स्थिर संस्करण"}</small>
            </div>
          </div>

          <div className="import-workspace-grid">
            <div className="import-workspace-main">
              <GlassPanel className="import-panel">
                <div className="import-panel__title">
                  <div className="admin-icon admin-icon--cyan">
                    <FileText aria-hidden="true" />
                  </div>
                  <div>
                    <span>01</span>
                    <h2>{currentCopy.uploadTitle}</h2>
                    <p>{locale === "en" ? "The source students will practice." : "विद्यार्थियों के अभ्यास का मूल स्रोत।"}</p>
                  </div>
                </div>

                <div className={"paper-dropzone" + (paperFile ? " has-file" : "")}>
                  <input
                    accept=".pdf,.jpg,.jpeg,.png"
                    aria-label={locale === "hi" ? "प्रश्न पत्र फ़ाइल" : "Paper file"}
                    hidden
                    onChange={onPaperSelected}
                    ref={paperInput}
                    type="file"
                  />
                  <div className="paper-dropzone__icon">
                    {paperFile ? <CheckCircle2 aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                  </div>
                  <strong>{paperFile?.name ?? currentCopy.uploadHint}</strong>
                  <span>{paperFile ? locale === "hi" ? "एक्सट्रैक्शन के लिए तैयार" : "Ready for extraction" : currentCopy.uploadDetail}</span>
                  <Button onClick={() => paperInput.current?.click()} tone="secondary">
                    <Files aria-hidden="true" size={17} />
                    {currentCopy.choose}
                  </Button>
                </div>
              </GlassPanel>

              <GlassPanel className="import-panel">
                <div className="import-panel__title">
                  <div className="admin-icon admin-icon--violet">
                    <Sparkles aria-hidden="true" />
                  </div>
                  <div>
                    <span>02</span>
                    <h2>{currentCopy.providerTitle}</h2>
                    <p>{currentCopy.providerDetail}</p>
                  </div>
                </div>

                {enabledProviders.length === 0 && <p role="status">{locale === "hi" ? "कोई एक्सट्रैक्शन प्रदाता सक्रिय नहीं है।" : "No extraction provider is enabled."}</p>}
                <div className="provider-grid">
                  {enabledProviders.map((item) => (
                    <button
                      aria-label={locale === "hi" ? item.id === "both" ? "दोनों प्रदाता चुनें" : `${item.title} चुनें` : item.label}
                      aria-pressed={provider === item.id}
                      className={"provider-card provider-card--" + item.accent}
                      key={item.id}
                      onClick={() => setProvider(item.id)}
                      type="button"
                    >
                      <span className="provider-card__check">
                        {provider === item.id && <Check aria-hidden="true" size={13} />}
                      </span>
                      <strong>{locale === "hi" && item.id === "both" ? "दोनों" : item.title}</strong>
                      <small>{locale === "hi" ? item.id === "both" ? "फ़ील्ड की तुलना और मतभेद समीक्षा" : "दस्तावेज़ से संरचित प्रश्न" : item.subtitle}</small>
                    </button>
                  ))}
                </div>
              </GlassPanel>

              <GlassPanel className="import-panel">
                <div className="import-panel__title">
                  <div className="admin-icon admin-icon--mint">
                    <FileKey2 aria-hidden="true" />
                  </div>
                  <div>
                    <span>03</span>
                    <h2>{currentCopy.supportTitle}</h2>
                    <p>{locale === "en" ? "Optional, but strongly recommended." : "वैकल्पिक, पर दृढ़ता से अनुशंसित।"}</p>
                  </div>
                </div>
                <div className="source-file-grid">
                  <input
                    accept=".pdf,.jpg,.jpeg,.png"
                    aria-label={locale === "hi" ? "आधिकारिक उत्तर कुंजी फ़ाइल" : "Official answer key file"}
                    hidden
                    onChange={(event) => setAnswerKeyFile(event.target.files?.[0])}
                    ref={answerKeyInput}
                    type="file"
                  />
                  <button onClick={() => answerKeyInput.current?.click()} type="button">
                    <FileKey2 aria-hidden="true" />
                    <span>
                      <strong>{answerKeyFile?.name ?? currentCopy.answerKey}</strong>
                      <small>{currentCopy.answerKeyDetail}</small>
                    </span>
                    <em>{locale === "hi" ? answerKeyFile ? "बदलें" : "+ जोड़ें" : answerKeyFile ? "Change" : "+ Add"}</em>
                  </button>
                  <input
                    accept=".pdf,.jpg,.jpeg,.png"
                    aria-label={locale === "hi" ? "समाधान पुस्तिका फ़ाइल" : "Solution booklet file"}
                    hidden
                    onChange={(event) => setSolutionFile(event.target.files?.[0])}
                    ref={solutionInput}
                    type="file"
                  />
                  <button onClick={() => solutionInput.current?.click()} type="button">
                    <ListChecks aria-hidden="true" />
                    <span>
                      <strong>{solutionFile?.name ?? currentCopy.solutions}</strong>
                      <small>{currentCopy.solutionsDetail}</small>
                    </span>
                    <em>{locale === "hi" ? solutionFile ? "बदलें" : "+ जोड़ें" : solutionFile ? "Change" : "+ Add"}</em>
                  </button>
                </div>
              </GlassPanel>

              <div className="import-action-row">
                <span><ShieldCheck aria-hidden="true" /> {locale === "hi" ? "प्रकाशन तक फ़ाइलें निजी रहती हैं।" : "Files stay private until publication."}</span>
                <Button disabled={!paperFile || enabledProviders.length === 0 || importStatus === "uploading"} onClick={startImport}>
                  {importStatus === "uploading" ? locale === "hi" ? "अपलोड हो रहा है…" : "Uploading…" : currentCopy.next}
                  <ChevronRight aria-hidden="true" size={18} />
                </Button>
              </div>
              {importStatus !== "idle" && importStatus !== "uploading" && (
                <p className="import-status" role="status">
                  {locale === "hi" ? importStatus === "queued" ? "इम्पोर्ट एक्सट्रैक्शन और समीक्षा के लिए कतार में है।" : "इम्पोर्ट कतार में नहीं जुड़ सका। फिर प्रयास करें।" : importStatus === "queued"
                    ? "Import queued for extraction and review."
                    : "The import could not be queued. Please retry."}
                  {importStatus === "queued" && importId && (
                    <Link href={`/admin/imports/${importId}`}>{currentCopy.openReview}</Link>
                  )}
                </p>
              )}
            </div>

            <aside className="import-review-rail">
              <GlassPanel className="review-gate-card">
                <div className="review-gate-card__halo">
                  <ShieldCheck aria-hidden="true" />
                </div>
                <p className="eyebrow">{currentCopy.safety}</p>
                <h2>{currentCopy.safetyTitle}</h2>
                <p>{currentCopy.safetyDetail}</p>
                <div className="review-checks">
                  <span><GitCompareArrows aria-hidden="true" /><i><strong>{locale === "hi" ? "प्रदाताओं के मतभेद" : "Provider conflicts"}</strong><small>{locale === "hi" ? "हर फ़ील्ड की तुलना" : "Compared field by field"}</small></i></span>
                  <span><AlertTriangle aria-hidden="true" /><i><strong>{locale === "hi" ? "विश्वास स्तर फ़्लैग" : "Confidence flags"}</strong><small>{locale === "hi" ? "80% से कम स्तर" : "Threshold below 80%"}</small></i></span>
                  <span><FileKey2 aria-hidden="true" /><i><strong>{locale === "hi" ? "आधिकारिक कुंजी प्राथमिक" : "Official key wins"}</strong><small>{locale === "hi" ? "उत्तर का स्रोत दर्ज है" : "Answer source is traceable"}</small></i></span>
                  <span><CheckCircle2 aria-hidden="true" /><i><strong>{locale === "hi" ? "स्पष्ट स्वीकृति" : "Explicit approval"}</strong><small>{locale === "hi" ? "प्रकाशन से पहले आवश्यक" : "Required before publish"}</small></i></span>
                </div>
              </GlassPanel>

              <div className="import-summary-card">
                <span>{locale === "hi" ? "अपेक्षित संरचना" : "Expected output"}</span>
                <div><strong>180</strong><small>{locale === "hi" ? "प्रश्न" : "questions"}</small></div>
                <div><strong>2</strong><small>{locale === "hi" ? "भाषाएँ" : "languages"}</small></div>
                <div><strong>5</strong><small>{locale === "hi" ? "विश्वास स्तर फ़ील्ड" : "confidence fields"}</small></div>
              </div>

              <p className="rights-note">
                <ShieldCheck aria-hidden="true" />
                {locale === "hi" ? "केवल वही पेपर अपलोड करें जिनके प्रकाशन का अधिकार आपके पास है। MedMock NTA से संबद्ध नहीं है।" : "Upload only papers you have the right to publish. MedMock is not affiliated with NTA."}
              </p>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
