import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthPanel } from "@/features/auth/auth-panel";
import { LocaleProvider } from "@/features/localization/locale-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthPanel", () => {
  it("requests an email OTP and confirms that the code was sent", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LocaleProvider>
        <AuthPanel />
      </LocaleProvider>,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "student@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send sign-in code" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/otp",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "student@example.com" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email for the secure sign-in link.",
    );
  });
});
