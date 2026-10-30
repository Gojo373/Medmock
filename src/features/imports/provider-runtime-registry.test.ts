import { describe, expect, it } from "vitest";

import * as registryModule from "@/features/imports/server/provider-runtime-registry";

describe("configured provider runtime registry", () => {
  it("allows Gemini-only operation and adds AgentRouter independently", () => {
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
          AGENT_ROUTER_API_KEY: "agentrouter-key",
          AGENT_ROUTER_MODEL: "vision-model",
          AGENT_ROUTER_BASE_URL: "https://agentrouter.example/v1",
        }),
      ),
    ).toEqual(["agentrouter"]);
  });
});
