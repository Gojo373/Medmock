import { describe, expect, it } from "vitest";
import { publishedBrowserFixture } from "../../tests/e2e/fixtures";

describe("published browser fixture requirements", () => {
  it("requires actual published identifiers and existing authenticated state", () => {
    expect(() => publishedBrowserFixture({ E2E_AUTH_STORAGE_STATE: "missing.json", E2E_PUBLISHED_PAPER_ID: "paper", E2E_PUBLISHED_VERSION_ID: "version" }, () => false)).toThrow("storage state");
    expect(() => publishedBrowserFixture({ E2E_AUTH_STORAGE_STATE: "auth.json", E2E_PUBLISHED_PAPER_ID: "replace-with-paper-id", E2E_PUBLISHED_VERSION_ID: "replace-with-version-id" }, () => true)).toThrow("published");
  });
  it("builds both protected entry paths from the same real publication", () => {
    const fixture = publishedBrowserFixture({ E2E_AUTH_STORAGE_STATE: "auth.json", E2E_PUBLISHED_PAPER_ID: "neet-2026", E2E_PUBLISHED_VERSION_ID: "published-current-3" }, () => true);
    expect(fixture.mockPath).toBe("/papers/neet-2026/mock?version=published-current-3");
    expect(fixture.practicePath).toBe("/papers/neet-2026/practice?version=published-current-3");
  });
});
