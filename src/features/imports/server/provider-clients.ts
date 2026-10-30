import {
  createGeminiExtractionProvider,
  createOpenAIExtractionProvider,
} from "@/features/imports/providers";
import { extractionResponseJsonSchema } from "@/features/imports/schema";
import type { ProviderRuntime } from "@/features/imports/server/import-processor";

type ProviderClientOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
  model: string;
};

async function requireJson(response: Response, operation: string) {
  if (!response.ok) {
    throw new Error(`${operation} failed (${response.status}).`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function openAIOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }

  throw new Error("OpenAI extraction returned no structured output.");
}

export function createOpenAIProviderRuntime({
  apiKey,
  fetcher = fetch,
  model,
}: ProviderClientOptions): ProviderRuntime {
  const authorization = { Authorization: `Bearer ${apiKey}` };
  const client = {
    responses: {
      async parse(request: unknown) {
        const response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            ...authorization,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        });
        const payload = await requireJson(response, "OpenAI extraction");
        return { output_parsed: JSON.parse(openAIOutputText(payload)) };
      },
    },
  };

  return {
    provider: createOpenAIExtractionProvider({
      client,
      model,
      format: {
        type: "json_schema",
        name: "medmock_import",
        strict: true,
        schema: extractionResponseJsonSchema,
      },
    }),
    async uploadFile(file) {
      const body = new FormData();
      body.set("purpose", "user_data");
      body.set("file", file, file.name);
      const response = await fetcher("https://api.openai.com/v1/files", {
        method: "POST",
        headers: authorization,
        body,
      });
      const payload = await requireJson(response, "OpenAI file upload");
      if (typeof payload.id !== "string") {
        throw new Error("OpenAI file upload returned no file identifier.");
      }
      return payload.id;
    },
  };
}

function geminiText(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  const content = first && typeof first === "object"
    ? (first as { content?: { parts?: unknown[] } }).content
    : undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");

  if (!text) throw new Error("Gemini extraction returned no structured output.");
  return text;
}

export function createGeminiProviderRuntime({
  apiKey,
  fetcher = fetch,
  model,
}: ProviderClientOptions): ProviderRuntime {
  const client = {
    models: {
      async generateContent(request: unknown) {
        const response = await fetcher(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(request),
          },
        );
        const payload = await requireJson(response, "Gemini extraction");
        return { text: geminiText(payload) };
      },
    },
  };

  return {
    provider: createGeminiExtractionProvider({ client, model }),
    async uploadFile(file) {
      const start = await fetcher(
        `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-upload-command": "start",
            "x-goog-upload-header-content-length": String(file.size),
            "x-goog-upload-header-content-type": file.type,
            "x-goog-upload-protocol": "resumable",
          },
          body: JSON.stringify({ file: { display_name: file.name } }),
        },
      );
      if (!start.ok) throw new Error(`Gemini file upload failed (${start.status}).`);
      const uploadUrl = start.headers.get("x-goog-upload-url");
      if (!uploadUrl) throw new Error("Gemini file upload returned no upload URL.");

      const upload = await fetcher(uploadUrl, {
        method: "POST",
        headers: {
          "content-length": String(file.size),
          "x-goog-upload-command": "upload, finalize",
          "x-goog-upload-offset": "0",
        },
        body: file,
      });
      const payload = await requireJson(upload, "Gemini file upload");
      const uploaded = payload.file;
      if (
        !uploaded ||
        typeof uploaded !== "object" ||
        typeof (uploaded as { uri?: unknown }).uri !== "string"
      ) {
        throw new Error("Gemini file upload returned no file URI.");
      }
      return (uploaded as { uri: string }).uri;
    },
  };
}
