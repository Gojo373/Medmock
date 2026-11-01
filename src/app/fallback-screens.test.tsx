import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import ErrorPage from "@/app/error";
import NotFoundPage from "@/app/not-found";
import { LocaleProvider } from "@/features/localization/locale-provider";

afterEach(() => vi.restoreAllMocks());

describe("fallback screens", () => {
  it.each(["error", "missing"])("localizes the %s fallback and accessible navigation under Hindi document language", (kind) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LocaleProvider initialLocale="hi">{kind === "error" ? <ErrorPage error={new Error("temporary")} retry={() => {}} /> : <NotFoundPage />}</LocaleProvider>);
    expect(document.documentElement.lang).toBe("hi");
    expect(screen.getByRole("link", { name: "MedMock मुख्य पृष्ठ" })).toBeVisible();
    expect(screen.getByRole("heading", { name: kind === "error" ? "यह स्क्रीन लोड नहीं हो सकी।" : "यह पेपर लाइब्रेरी में नहीं है।" })).toBeVisible();
    if (kind === "error") expect(screen.getByRole("button", { name: "फिर प्रयास करें" })).toBeVisible();
  });

  it("refetches transient server content through Next retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce("Recovered paper library");
    await expect(load()).rejects.toThrow("temporary");
    function Boundary() {
      const [content, setContent] = useState<string>();
      return content ? <h1>{content}</h1> : <ErrorPage error={new Error("temporary")} retry={() => { void load().then(setContent); }} />;
    }
    render(<LocaleProvider><Boundary /></LocaleProvider>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Recovered paper library" })).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
