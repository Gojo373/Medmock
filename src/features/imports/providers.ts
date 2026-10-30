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
      const supportingFiles = [
        source.answerKey
          ? {
              type: "input_file",
              file_id: source.answerKey.fileId,
            }
          : undefined,
        source.solution
          ? {
              type: "input_file",
              file_id: source.solution.fileId,
            }
          : undefined,
      ].filter((item): item is { type: string; file_id: string } => Boolean(item));
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
              ...supportingFiles,
              {
                type: "input_text",
                text:
                  "The first file is the question paper. Any second file is the official answer key and overrides model suggestions. Any third file is the solution booklet. Return the complete paper using the configured extraction schema.",
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
      const supportingFiles = [source.answerKey, source.solution]
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => ({
          fileData: {
            fileUri: item.fileId,
            mimeType: item.mimeType,
          },
        }));
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
              ...supportingFiles,
              {
                text:
                  extractionPrompt +
                  " The first file is the question paper. Any second file is the official answer key and overrides model suggestions. Any third file is the solution booklet.",
              },
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
