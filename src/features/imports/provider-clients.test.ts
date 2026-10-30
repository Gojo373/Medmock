import { describe, expect, it, vi } from "vitest";

import {
  createGeminiProviderRuntime,
  createOpenAIProviderRuntime,
} from "@/features/imports/server/provider-clients";

function payload() {
  return {
    schemaVersion: 1 as const,
    paper: {
      title: { en: "NEET", hi: "नीट" },
      year: 2025,
      durationMinutes: 180,
      sections: [],
      questions: [],
    },
  };
}

describe("production import provider clients", () => {
  it("uploads private files and calls OpenAI Responses with server credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ id: "file-openai" }),
      )
      .mockResolvedValueOnce(
        Response.json({ output_text: JSON.stringify(payload()) }),
      );
    const runtime = createOpenAIProviderRuntime({
      apiKey: "openai-secret",
      fetcher,
      model: "gpt-test",
    });
    const fileId = await runtime.uploadFile(
      new File(["paper"], "paper.pdf", { type: "application/pdf" }),
    );

    const document = await runtime.provider.extract({
      fileId,
      fileName: "paper.pdf",
      mimeType: "application/pdf",
    });

    expect(fileId).toBe("file-openai");
    expect(document.provider).toBe("openai");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/files");
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer openai-secret",
    );
    expect(fetcher.mock.calls[1][0]).toBe("https://api.openai.com/v1/responses");
  });

  it("uses Gemini resumable file upload before structured generation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "x-goog-upload-url": "https://upload.example/file" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ file: { uri: "https://generativelanguage.googleapis.com/files/1" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(payload()) }] } },
          ],
        }),
      );
    const runtime = createGeminiProviderRuntime({
      apiKey: "gemini-secret",
      fetcher,
      model: "gemini-test",
    });
    const fileId = await runtime.uploadFile(
      new File(["paper"], "paper.pdf", { type: "application/pdf" }),
    );

    const document = await runtime.provider.extract({
      fileId,
      fileName: "paper.pdf",
      mimeType: "application/pdf",
    });

    expect(document.provider).toBe("gemini");
    expect(String(fetcher.mock.calls[0][0])).toContain("/upload/v1beta/files?key=gemini-secret");
    expect(fetcher.mock.calls[1][0]).toBe("https://upload.example/file");
    expect(String(fetcher.mock.calls[2][0])).toContain(
      "/v1beta/models/gemini-test:generateContent?key=gemini-secret",
    );
    const generationRequest = JSON.parse(
      String(fetcher.mock.calls[2][1]?.body),
    ) as Record<string, unknown>;
    expect(generationRequest).toMatchObject({
      contents: expect.any(Array),
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: expect.any(Object),
      },
    });
    expect(generationRequest).not.toHaveProperty("model");
    expect(generationRequest).not.toHaveProperty("config");
  });

  it("rejects provider HTTP failures without exposing response bodies", async () => {
    const runtime = createOpenAIProviderRuntime({
      apiKey: "openai-secret",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("sensitive upstream detail", { status: 401 }),
      ),
      model: "gpt-test",
    });

    await expect(
      runtime.uploadFile(new File(["paper"], "paper.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("OpenAI file upload failed (401).");
  });
});
