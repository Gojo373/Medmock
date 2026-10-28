import {
  ExtractionDocumentSchema,
  ExtractionPayloadSchema,
  ProviderSelectionSchema,
  extractionResponseJsonSchema,
  type ExtractionDocument,
  type ExtractionProviderId,
  type ExtractionSource,
  type ProviderSelection,
} from "@/features/imports/schema";

const extractionPrompt =
  "Extract every NEET question, bilingual text, options, reviewed answer candidates, solution, topic, section, and field confidence. Preserve missing values for admin review and never invent publication approval.";

export interface ExtractionProvider {
  id: ExtractionProviderId;
  extract(source: ExtractionSource): Promise<ExtractionDocument>;
}

type ProviderRegistry = Record<ExtractionProviderId, ExtractionProvider>;

export function selectExtractionProviders(
  selectionInput: ProviderSelection,
  registry: ProviderRegistry,
): ExtractionProvider[] {
  const selection = ProviderSelectionSchema.parse(selectionInput);

  if (selection === "openai") {
    return [registry.openai];
  }

  if (selection === "gemini") {
    return [registry.gemini];
  }

  return [registry.openai, registry.gemini];
}

type OpenAIResponsesClient = {
  responses: {
    parse(request: unknown): Promise<{ output_parsed: unknown }>;
  };
};

export function createOpenAIExtractionProvider({
  client,
  model,
  format,
}: {
  client: OpenAIResponsesClient;
  model: string;
  format: unknown;
}): ExtractionProvider {
  return {
    id: "openai",
    async extract(source) {
      const response = await client.responses.parse({
        model,
        input: [
          {
            role: "system",
            content: extractionPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "input_file",
                file_id: source.fileId,
              },
              {
                type: "input_text",
                text: "Return the complete paper using the configured extraction schema.",
              },
            ],
          },
        ],
        text: { format },
      });
      const extracted = ExtractionPayloadSchema.parse(response.output_parsed);

      return ExtractionDocumentSchema.parse({
        ...extracted,
        provider: "openai",
        source,
      });
    },
  };
}

type GeminiModelsClient = {
  models: {
    generateContent(request: unknown): Promise<{ text: string }>;
  };
};

export function createGeminiExtractionProvider({
  client,
  model,
}: {
  client: GeminiModelsClient;
  model: string;
}): ExtractionProvider {
  return {
    id: "gemini",
    async extract(source) {
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: source.fileId,
                  mimeType: source.mimeType,
                },
              },
              { text: extractionPrompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: extractionResponseJsonSchema,
        },
      });
      const extracted = ExtractionPayloadSchema.parse(JSON.parse(response.text));

      return ExtractionDocumentSchema.parse({
        ...extracted,
        provider: "gemini",
        source,
      });
    },
  };
}
