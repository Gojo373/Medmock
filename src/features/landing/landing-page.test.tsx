import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthPanel } from "@/features/auth/auth-panel";
import { LandingPage } from "@/features/landing/landing-page";
import { LocaleProvider } from "@/features/localization/locale-provider";

describe("LandingPage", () => {
  it("links a published Supabase paper version into the student journey", () => {
    render(
      <LocaleProvider initialLocale="en">
        <LandingPage
          papers={[
            {
              id: "neet-reviewed",
              versionId: "neet-reviewed-current-v2",
              pattern: "current",
              title: {
                en: "Reviewed NEET current pattern",
                hi: "समीक्षित नीट वर्तमान पैटर्न",
              },
              publishedAt: "2026-10-28T10:00:00.000Z",
              questions: 180,
              minutes: 180,
              attempts: "New",
              gradient: "paper-card--cyan",
            },
          ]}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Reviewed NEET current pattern" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start paper" }),
    ).toHaveAttribute(
      "href",
      "/papers/neet-reviewed?version=neet-reviewed-current-v2",
    );
  });

  it("presents the MedMock brand, navigation, and published paper library", () => {
    render(
      <LocaleProvider initialLocale="en">
        <LandingPage />
      </LocaleProvider>,
    );

    expect(screen.getByRole("heading", { name: "MedMock" })).toBeInTheDocument();
    expect(
      screen.getByText("Practice the paper. Master the pressure."),
    ).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(navigation).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Explore papers" })).toHaveAttribute(
      "href",
      "#papers",
    );
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NEET 2025" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NEET 2024" })).toBeInTheDocument();
  });

  it("switches the complete landing experience to Hindi", async () => {
    const user = userEvent.setup();

    render(
      <LocaleProvider initialLocale="en">
        <LandingPage />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "हिंदी" }));

    expect(
      within(screen.getByRole("navigation", { name: "मुख्य नेविगेशन" })).getByRole("link", {
        name: "पेपर खोजें",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "असली पेपर। बेहतर तैयारी।",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  });

  it("switches between light and dark presentation", async () => {
    const user = userEvent.setup();

    render(
      <LocaleProvider initialLocale="en">
        <LandingPage />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });
});

describe("AuthPanel", () => {
  it("offers Google and email OTP entry points", () => {
    render(
      <LocaleProvider initialLocale="en">
        <AuthPanel />
      </LocaleProvider>,
    );

    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/api/auth/google",
    );
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByRole("button", { name: "Send sign-in code" })).toBeInTheDocument();
  });
});
