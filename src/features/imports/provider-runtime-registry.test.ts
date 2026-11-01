import { describe, expect, it } from "vitest";

import * as registryModule from "@/features/imports/server/provider-runtime-registry";

describe("configured provider runtime registry", () => {
  it("allows Gemini-only operation and requires an explicit OpenAI enable flag", () => {
    const createConfiguredProviderRuntimes = (
      registryModule as typeof registryModule & {
        createConfiguredProviderRuntimes: (
          environment: Record<string, string | undefined>,
        ) => Record<string, unknown>;
      }
    ).createConfiguredProviderRuntimes;

    expect(
      Object.keys(
        createConfiguredProviderRuntimes({
          GEMINI_API_KEY: "gemini-key",
          GEMINI_IMPORT_MODEL: "gemini-model",
        }),
      ),
    ).toEqual(["gemini"]);

    expect(
      Object.keys(
        createConfiguredProviderRuntimes({
          OPENAI_API_KEY: "openai-key",
          GEMINI_API_KEY: "gemini-key",
        }),
      ),
    ).toEqual(["gemini"]);

    expect(
      Object.keys(
        createConfiguredProviderRuntimes({
          OPENAI_API_KEY: "openai-key",
          OPENAI_IMPORTS_ENABLED: "false",
          GEMINI_API_KEY: "gemini-key",
        }),
      ),
    ).toEqual(["gemini"]);

    expect(
      Object.keys(
        createConfiguredProviderRuntimes({
          OPENAI_API_KEY: "openai-key",
          OPENAI_IMPORTS_ENABLED: "true",
        }),
      ),
    ).toEqual(["openai"]);
  });
});
