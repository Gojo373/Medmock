import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminImportReview } from "@/features/imports/admin-import-review";

const reviewDocument = {
  schemaVersion: 1,
  status: "review_required",
  providers: ["openai", "gemini"],
  paper: {
    title: { en: "NEET", hi: "नीट" },
    year: 2025,
    durationMinutes: 180,
    sections: [],
    questions: [],
  },
  reviewFlags: [
    {
      id: "provider_conflict:questions.1.stem.en",
      code: "provider_conflict",
      path: "questions.1.stem.en",
      message: "Providers disagree on this field.",
      severity: "warning",
      resolved: false,
      providerValues: {
        openai: "OpenAI wording",
        gemini: "Gemini wording",
      },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("AdminImportReview", () => {
  it("shows source files and the complete bilingual paper content and saves edits", async () => {
    const user = userEvent.setup();
    const completeDocument = {
      ...reviewDocument,
      paper: {
        ...reviewDocument.paper,
        sections: [
          {
            id: "physics",
            subject: "physics",
            title: { en: "Physics", hi: "भौतिक विज्ञान" },
            questionNumbers: ["1"],
            selectionLimit: null,
          },
        ],
        questions: [
          {
            sourceNumber: "1",
            sectionId: "physics",
            subject: "physics",
            topic: "Mechanics",
            stem: { en: "What is force?", hi: "बल क्या है?" },
            options: [
              { id: "A", text: { en: "Mass times acceleration", hi: "द्रव्यमान गुणा त्वरण" } },
              { id: "B", text: { en: "Energy", hi: "ऊर्जा" } },
            ],
            acceptedOptionIds: ["A"],
            solution: { en: "Use Newton's second law.", hi: "न्यूटन का दूसरा नियम लगाएँ।" },
            disposition: "standard",
            marking: { correct: 4, incorrect: -1, unattempted: 0 },
            answerKeyProvenance: { source: "provider" },
            confidence: {},
          },
        ],
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          document: completeDocument,
          canPublish: false,
          sources: [
            {
              kind: "paper",
              fileName: "neet-paper.pdf",
              downloadUrl: "https://storage.example/signed-paper",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ reviewed: completeDocument, canPublish: false, issues: [] }),
      );
    vi.stubGlobal("fetch", fetcher);

    render(<AdminImportReview importId="import-1" />);

    expect(await screen.findByRole("link", { name: "Open question paper" })).toHaveAttribute(
      "href",
      "https://storage.example/signed-paper",
    );
    expect(screen.getByRole("heading", { name: "Physics / भौतिक विज्ञान" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Question 1" })).toBeInTheDocument();
    expect(screen.getByText("What is force?")).toBeInTheDocument();
    expect(screen.getByText("बल क्या है?")).toBeInTheDocument();
    expect(screen.getByText(/Mass times acceleration \/ द्रव्यमान गुणा त्वरण/)).toBeInTheDocument();
    expect(screen.getByText("Use Newton's second law. / न्यूटन का दूसरा नियम लगाएँ।")).toBeInTheDocument();

    const editor = screen.getByRole("textbox", { name: "Complete reviewed paper JSON" });
    const edited = structuredClone(completeDocument.paper);
    edited.questions[0].topic = "Laws of motion";
    fireEvent.change(editor, { target: { value: JSON.stringify(edited) } });
    await user.click(screen.getByRole("button", { name: "Save complete paper edits" }));

    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/imports/import-1/review",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ edits: [{ path: "paper", value: edited }] }),
      }),
    );
  });

  it("shows every provider value and persists an explicit review decision", async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          importId: "import-1",
          status: "review_required",
          document: reviewDocument,
          canPublish: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          reviewed: {
            ...reviewDocument,
            reviewFlags: [{ ...reviewDocument.reviewFlags[0], resolved: true }],
          },
          canPublish: true,
          issues: [],
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    render(<AdminImportReview importId="import-1" />);

    expect(await screen.findByText("OpenAI wording")).toBeInTheDocument();
    expect(screen.getByText("Gemini wording")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use OpenAI value" }));

    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/imports/import-1/review",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          decisions: [
            {
              flagId: "provider_conflict:questions.1.stem.en",
              resolution: "accept_primary",
            },
          ],
        }),
      }),
    );
    expect(await screen.findByText("Ready for explicit publication approval.")).toBeInTheDocument();
  });

  it("supports Hindi controls and never enables publication without approval", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          importId: "import-1",
          status: "ready_to_publish",
          document: {
            ...reviewDocument,
            reviewFlags: [{ ...reviewDocument.reviewFlags[0], resolved: true }],
          },
          canPublish: true,
        }),
      ),
    );

    render(<AdminImportReview importId="import-1" />);
    await screen.findByRole("heading", { name: "Review every extracted field" });
    await user.click(screen.getByRole("button", { name: "Switch review language" }));

    expect(screen.getByRole("heading", { name: "हर निकाले गए फ़ील्ड की समीक्षा करें" })).toBeInTheDocument();
    const publish = screen.getByRole("button", { name: "दोनों स्थिर संस्करण प्रकाशित करें" });
    expect(publish).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /मैंने हर फ़्लैग की समीक्षा की है/i }));
    expect(publish).toBeEnabled();
  });

  it("announces a failed review decision without marking the flag resolved", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            importId: "import-1",
            status: "review_required",
            document: reviewDocument,
            canPublish: false,
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ error: "service_unavailable" }, { status: 503 }),
        ),
    );

    render(<AdminImportReview importId="import-1" />);
    await user.click(await screen.findByRole("button", { name: "Use OpenAI value" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Review decision could not be saved. Please retry.",
    );
    expect(screen.getByText("Needs decision")).toBeInTheDocument();
  });

  it("shows a durable processing state while the worker is still extracting", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ error: "import_not_found" }, { status: 404 }),
        )
        .mockResolvedValueOnce(
          Response.json({
            importId: "import-1",
            status: "extracting",
            reviewFlagCount: 0,
          }),
        ),
    );

    render(<AdminImportReview importId="import-1" />);

    expect(
      await screen.findByText(
        "Extraction is still running. This review will refresh automatically.",
      ),
    ).toHaveAttribute("role", "status");
    expect(screen.queryByText("The review document could not be loaded.")).not.toBeInTheDocument();
  });
});
