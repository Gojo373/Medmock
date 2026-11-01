import {
  createGeminiProviderRuntime,
  createOpenAIProviderRuntime,
} from "@/features/imports/server/provider-clients";
import type { ProviderRuntimes } from "@/features/imports/server/import-processor";

export function createConfiguredProviderRuntimes(
  environment: Record<string, string | undefined> = process.env,
) {
  const runtimes: ProviderRuntimes = {};
  const openAIKey = environment.OPENAI_API_KEY?.trim();
  const geminiKey = environment.GEMINI_API_KEY?.trim();

  if (openAIKey && environment.OPENAI_IMPORTS_ENABLED === "true") {
    runtimes.openai = createOpenAIProviderRuntime({
      apiKey: openAIKey,
      model: environment.OPENAI_IMPORT_MODEL?.trim() || "gpt-5-mini",
    });
  }
  if (geminiKey) {
    runtimes.gemini = createGeminiProviderRuntime({
      apiKey: geminiKey,
      model: environment.GEMINI_IMPORT_MODEL?.trim() || "gemini-3.8-flash",
    });
  }
  if (Object.keys(runtimes).length === 0) {
    throw new Error("At least one import provider must be configured.");
  }
  return runtimes;
}
