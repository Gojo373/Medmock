import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AdminImportWorkspace } from "@/features/imports/admin-import-workspace";

describe("AdminImportWorkspace", () => {
  it("presents a guided paper upload and review workflow", () => {
    render(<AdminImportWorkspace />);

    expect(
      screen.getByRole("heading", { name: "Turn a paper into a reviewed CBT" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PDF, JPG or PNG")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose paper files" })).toBeInTheDocument();
    expect(screen.getByText("Nothing publishes without your approval.")).toBeInTheDocument();
  });

  it("lets the admin choose OpenAI, Gemini, or both", async () => {
    const user = userEvent.setup();
    render(<AdminImportWorkspace />);

    const both = screen.getByRole("button", { name: "Use both providers" });
    const openai = screen.getByRole("button", { name: "Use OpenAI" });

    expect(both).toHaveAttribute("aria-pressed", "true");
    await user.click(openai);

    expect(openai).toHaveAttribute("aria-pressed", "true");
    expect(both).toHaveAttribute("aria-pressed", "false");
  });
});
