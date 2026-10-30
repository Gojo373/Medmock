import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminImportWorkspace } from "@/features/imports/admin-import-workspace";

afterEach(() => vi.unstubAllGlobals());

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

  it("uploads the selected source and starts a durable import job", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ importId: "import-1", status: "uploaded" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminImportWorkspace />);

    await user.upload(
      screen.getByLabelText("Paper file"),
      new File(["paper"], "neet.pdf", { type: "application/pdf" }),
    );
    await user.upload(
      screen.getByLabelText("Official answer key file"),
      new File(["key"], "key.pdf", { type: "application/pdf" }),
    );
    await user.upload(
      screen.getByLabelText("Solution booklet file"),
      new File(["solutions"], "solutions.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: /start reviewed extraction/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/upload",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const request = fetchMock.mock.calls[0][1] as { body: FormData };
    expect((request.body.get("answerKey") as File).name).toBe("key.pdf");
    expect((request.body.get("solution") as File).name).toBe("solutions.pdf");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Import queued for extraction and review.",
    );
    expect(screen.getByRole("link", { name: "Open import review" })).toHaveAttribute(
      "href",
      "/admin/imports/import-1",
    );
  });
});
