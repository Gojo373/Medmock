import { screen, within } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminImportWorkspace } from "@/features/imports/admin-import-workspace";

afterEach(() => vi.unstubAllGlobals());

describe("AdminImportWorkspace", () => {
  it("disables extraction and explains when no provider is enabled", async () => {
    const user = userEvent.setup();
    render(<AdminImportWorkspace availableProviders={[]} />);
    await user.upload(screen.getByLabelText("Paper file"), new File(["paper"], "neet.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("status")).toHaveTextContent("No extraction provider is enabled.");
    expect(screen.getByRole("button", { name: "Start reviewed extraction" })).toBeDisabled();
  });

  it("navigates to implemented import, public-library, and personal-history destinations", () => {
    render(<AdminImportWorkspace availableProviders={["gemini"]} />);
    const navigation = screen.getByRole("navigation", { name: "Admin navigation" });
    expect(within(navigation).getByRole("link", { name: "Paper imports" })).toHaveAttribute("aria-current", "page");
    expect(within(navigation).getByRole("link", { name: "Paper library" })).toHaveAttribute("href", "/#papers");
    expect(within(navigation).getByRole("link", { name: "My attempt history" })).toHaveAttribute("href", "/dashboard");
    expect(within(navigation).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin/imports", "/#papers", "/dashboard"]);
  });

  it("presents a guided paper upload and review workflow", () => {
    render(<AdminImportWorkspace />);

    expect(
      screen.getByRole("heading", { name: "Turn a paper into a reviewed CBT" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PDF, JPG or PNG")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose paper files" })).toBeInTheDocument();
    expect(screen.getByText("Nothing publishes without your approval.")).toBeInTheDocument();
  });

  it("shows only enabled providers and defaults to Gemini when OpenAI is disabled", () => {
    render(<AdminImportWorkspace availableProviders={["gemini"]} />);

    expect(screen.getByRole("button", { name: "Use Gemini" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: "Use OpenAI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use both providers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use AgentRouter" })).not.toBeInTheDocument();
  });

  it("lets the admin choose OpenAI, Gemini, or both when both are enabled", async () => {
    const user = userEvent.setup();
    render(<AdminImportWorkspace availableProviders={["openai", "gemini"]} />);

    const both = screen.getByRole("button", { name: "Use both providers" });
    const openai = screen.getByRole("button", { name: "Use OpenAI" });

    expect(both).toHaveAttribute("aria-pressed", "true");
    await user.click(openai);

    expect(openai).toHaveAttribute("aria-pressed", "true");
    expect(both).toHaveAttribute("aria-pressed", "false");
  });

  it("uploads the selected source and starts a durable import job", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          importId: "import-1",
          status: "uploading",
          uploads: [
            { kind: "paper", uploadUrl: "https://storage.example/paper" },
            { kind: "answer_key", uploadUrl: "https://storage.example/key" },
            { kind: "solution", uploadUrl: "https://storage.example/solution" },
          ],
        }, { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({ importId: "import-1", status: "uploaded" }, { status: 202 }),
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

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/imports/upload",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      providerSelection: "both",
      files: [
        { kind: "paper", fileName: "neet.pdf", mimeType: "application/pdf", size: 5 },
        { kind: "answer_key", fileName: "key.pdf", mimeType: "application/pdf", size: 3 },
        { kind: "solution", fileName: "solutions.pdf", mimeType: "application/pdf", size: 9 },
      ],
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://storage.example/paper",
      expect.objectContaining({ method: "PUT", body: expect.any(File) }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/imports/upload/import-1/complete",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Import queued for extraction and review.",
    );
    expect(screen.getByRole("link", { name: "Open import review" })).toHaveAttribute(
      "href",
      "/admin/imports/import-1",
    );
  });
});
