import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnalyticsEmptyState, AnalyticsLoadingState, AnalyticsShell } from "@/features/analytics/analytics-workspace";
import { analyticsDemo } from "@/features/analytics/analytics-demo";
import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { AdminImportReview } from "@/features/imports/admin-import-review";
import { AdminImportWorkspace } from "@/features/imports/admin-import-workspace";
import { LandingPage } from "@/features/landing/landing-page";
import { LocaleProvider } from "@/features/localization/locale-provider";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared UI locale", () => {
  it("still switches language when the browser refuses preference storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
    const user = userEvent.setup();
    render(<LocaleProvider><LandingPage /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "हिंदी" }));
    expect(document.documentElement).toHaveAttribute("lang", "hi");
    expect(screen.getByRole("heading", { name: "असली पेपर। बेहतर तैयारी।" })).toBeInTheDocument();
  });

  it("updates document language and Hindi accessible names on the landing page", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider><LandingPage /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "हिंदी" }));
    expect(document.documentElement).toHaveAttribute("lang", "hi");
    expect(screen.getByRole("button", { name: "गहरी थीम चुनें" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MedMock मुख्य पृष्ठ" })).toBeInTheDocument();
    expect(screen.getByLabelText("प्रश्न पैलेट झलक")).toBeInTheDocument();
  });

  it("retains Hindi across route content changes and provider remounts", async () => {
    const user = userEvent.setup();
    const view = render(<LocaleProvider><LandingPage /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "हिंदी" }));
    view.rerender(<LocaleProvider><AnalyticsEmptyState /></LocaleProvider>);
    expect(screen.getByRole("heading", { name: "आपके परिणाम यहाँ दिखाई देंगे" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "विश्लेषण की भाषा बदलें" })).toBeInTheDocument();
    view.unmount();
    render(<LocaleProvider><AnalyticsLoadingState /></LocaleProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("आपका डैशबोर्ड लोड हो रहा है");
    expect(document.documentElement).toHaveAttribute("lang", "hi");
  });

  it("uses the shared Hindi locale for exam content and theme accessibility", () => {
    render(<LocaleProvider initialLocale="hi"><ExamWorkspace mode="mock" paper={sampleExamPaper} userId="locale-student" /></LocaleProvider>);
    expect(screen.getByText("समय शेष")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MedMock मुख्य पृष्ठ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "गहरी थीम चुनें" })).toBeInTheDocument();
  });

  it("uses Hindi for admin source fields and navigation accessible names", () => {
    render(<LocaleProvider initialLocale="hi"><AdminImportWorkspace availableProviders={["gemini"]} /></LocaleProvider>);
    expect(screen.getByRole("heading", { name: "पेपर को समीक्षित CBT में बदलें" })).toBeInTheDocument();
    expect(screen.getByLabelText("प्रश्न पत्र फ़ाइल")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "एडमिन नेविगेशन" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "एडमिन की भाषा बदलें" })).toBeInTheDocument();
  });

  it("uses Hindi for review loading and language controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 })));
    render(<LocaleProvider initialLocale="hi"><AdminImportReview importId="locale-review" /></LocaleProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("समीक्षा दस्तावेज़ लोड हो रहा है");
    expect(screen.getByRole("button", { name: "समीक्षा की भाषा बदलें" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("समीक्षा दस्तावेज़ लोड नहीं हो सका");
  });

  it("uses Hindi for analytics regions and eligibility status", () => {
    render(<LocaleProvider initialLocale="hi"><AnalyticsShell {...analyticsDemo} /></LocaleProvider>);
    expect(screen.getByRole("region", { name: "प्रयास सारांश" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "समाधान समीक्षा" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "विश्लेषण नेविगेशन" })).toBeInTheDocument();
    expect(screen.getByText("64 / 100 योग्य प्रयास")).toBeInTheDocument();
  });
});
