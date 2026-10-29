"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileKey2,
  FileText,
  Files,
  GitCompareArrows,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
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

export function AdminImportWorkspace() {
  const [provider, setProvider] = useState<ProviderSelection>("both");
  const [locale, setLocale] = useState<keyof typeof copy>("en");
  const [paperFile, setPaperFile] = useState<File>();
  const [importStatus, setImportStatus] = useState<"error" | "idle" | "queued" | "uploading">("idle");
  const paperInput = useRef<HTMLInputElement>(null);
  const currentCopy = copy[locale];

  function onPaperSelected(event: ChangeEvent<HTMLInputElement>) {
    setPaperFile(event.target.files?.[0]);
  }

  async function startImport() {
    if (!paperFile) return;
    setImportStatus("uploading");
    const body = new FormData();
    body.set("paper", paperFile);
    body.set("providerSelection", provider);

    try {
      const response = await fetch("/api/imports/upload", {
        method: "POST",
        body,
      });
      setImportStatus(response.ok ? "queued" : "error");
    } catch {
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
          <span>Admin</span>
          <ChevronRight aria-hidden="true" size={15} />
          <strong>{locale === "en" ? "Paper imports" : "पेपर इम्पोर्ट"}</strong>
        </div>
        <div className="admin-topbar__actions">
          <span className="admin-live-chip">
            <i />
            {locale === "en" ? "Systems healthy" : "सिस्टम सक्रिय"}
          </span>
          <Button
            aria-label="Switch admin language"
            className="admin-language"
            onClick={() => setLocale((value) => (value === "en" ? "hi" : "en"))}
            tone="ghost"
          >
            {currentCopy.language}
          </Button>
          <ThemeToggle />
          <div className="admin-avatar" title="MedMock administrator">
            DS
          </div>
        </div>
      </header>

      <div className="admin-frame">
        <aside className="admin-sidebar">
          <nav aria-label="Admin navigation">
            <a href="/admin"><LayoutDashboard aria-hidden="true" /> Overview</a>
            <a className="is-active" href="/admin/imports">
              <UploadCloud aria-hidden="true" /> Paper imports
              <span>3</span>
            </a>
            <a href="/admin/papers"><LibraryBig aria-hidden="true" /> Paper library</a>
            <a href="/admin/reviews"><ClipboardCheck aria-hidden="true" /> Review queue</a>
            <a href="/admin/students"><Users aria-hidden="true" /> Students</a>
            <a href="/admin/analytics"><BarChart3 aria-hidden="true" /> Analytics</a>
          </nav>
          <div className="admin-sidebar__bottom">
            <a href="/admin/settings"><Settings2 aria-hidden="true" /> Settings</a>
            <div className="capacity-card">
              <Sparkles aria-hidden="true" />
              <strong>500 concurrent</strong>
              <span>Launch capacity target</span>
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

          <div className="import-stepper" aria-label="Import progress">
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
                    aria-label="Paper file"
                    hidden
                    onChange={onPaperSelected}
                    ref={paperInput}
                    type="file"
                  />
                  <div className="paper-dropzone__icon">
                    {paperFile ? <CheckCircle2 aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                  </div>
                  <strong>{paperFile?.name ?? currentCopy.uploadHint}</strong>
                  <span>{paperFile ? "Ready for extraction" : currentCopy.uploadDetail}</span>
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

                <div className="provider-grid">
                  {providers.map((item) => (
                    <button
                      aria-label={item.label}
                      aria-pressed={provider === item.id}
                      className={"provider-card provider-card--" + item.accent}
                      key={item.id}
                      onClick={() => setProvider(item.id)}
                      type="button"
                    >
                      <span className="provider-card__check">
                        {provider === item.id && <Check aria-hidden="true" size={13} />}
                      </span>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
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
                  <button type="button">
                    <FileKey2 aria-hidden="true" />
                    <span><strong>{currentCopy.answerKey}</strong><small>{currentCopy.answerKeyDetail}</small></span>
                    <em>+ Add</em>
                  </button>
                  <button type="button">
                    <ListChecks aria-hidden="true" />
                    <span><strong>{currentCopy.solutions}</strong><small>{currentCopy.solutionsDetail}</small></span>
                    <em>+ Add</em>
                  </button>
                </div>
              </GlassPanel>

              <div className="import-action-row">
                <span><ShieldCheck aria-hidden="true" /> Files stay private until publication.</span>
                <Button disabled={!paperFile || importStatus === "uploading"} onClick={startImport}>
                  {importStatus === "uploading" ? "Uploading…" : currentCopy.next}
                  <ChevronRight aria-hidden="true" size={18} />
                </Button>
              </div>
              {importStatus !== "idle" && importStatus !== "uploading" && (
                <p className="import-status" role="status">
                  {importStatus === "queued"
                    ? "Import queued for extraction and review."
                    : "The import could not be queued. Please retry."}
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
                  <span><GitCompareArrows aria-hidden="true" /><i><strong>Provider conflicts</strong><small>Compared field by field</small></i></span>
                  <span><AlertTriangle aria-hidden="true" /><i><strong>Confidence flags</strong><small>Threshold below 80%</small></i></span>
                  <span><FileKey2 aria-hidden="true" /><i><strong>Official key wins</strong><small>Answer source is traceable</small></i></span>
                  <span><CheckCircle2 aria-hidden="true" /><i><strong>Explicit approval</strong><small>Required before publish</small></i></span>
                </div>
              </GlassPanel>

              <div className="import-summary-card">
                <span>Expected output</span>
                <div><strong>180</strong><small>questions</small></div>
                <div><strong>2</strong><small>languages</small></div>
                <div><strong>5</strong><small>confidence fields</small></div>
              </div>

              <p className="rights-note">
                <ShieldCheck aria-hidden="true" />
                Upload only papers you have the right to publish. MedMock is not affiliated with NTA.
              </p>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
