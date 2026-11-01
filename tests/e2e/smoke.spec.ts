import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { publishedBrowserFixture } from "./fixtures";

async function visit(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname + url.search === path);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText("This paper is not in the library.")).toHaveCount(0);
}

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);
}

for (const path of ["/", "/sign-in"]) {
  test(`${path} renders accessible public content`, async ({ page }) => {
    await visit(page, path);
    await expect(page.locator("h1").first()).toBeVisible();
    await accessible(page);
  });
}

for (const path of ["/dashboard", "/admin/imports"]) {
  test(`${path} requires authentication`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === path);
  });
}

test.describe("authenticated published fixtures", () => {
  test.skip(!process.env.E2E_AUTH_STORAGE_STATE, "Requires an authenticated staging fixture; skipped is not launch verification.");

  test("published mock survives refresh and reconnection and submits scored results", async ({ browser, baseURL }) => {
    const fixture = publishedBrowserFixture(process.env);
    const context = await browser.newContext({ storageState: fixture.storageState, baseURL });
    await context.addInitScript(() => localStorage.setItem("medmock-locale", "en"));
    const page = await context.newPage();
    try {
      await visit(page, fixture.detailPath);
      await expect(page.getByRole("link", { name: "Start strict mock" })).toHaveAttribute("href", fixture.mockPath);
      const created = page.waitForResponse((response) => response.url().endsWith("/api/attempts") && response.request().method() === "POST");
      await visit(page, fixture.mockPath);
      expect((await created).ok()).toBe(true);
      await expect(page.getByText("Strict mock · answers concealed")).toBeVisible();
      await accessible(page);
      const options = page.locator(".answer-options button");
      await options.first().click();
      await expect(page.getByText(/events ready to sync/)).toHaveText("0 events ready to sync");
      await page.reload();
      await expect(options.first()).toHaveAttribute("aria-pressed", "true");
      await context.setOffline(true);
      await options.nth(1).click();
      await expect(options.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText(/events ready to sync/)).not.toHaveText("0 events ready to sync");
      const reconnected = page.waitForResponse((response) => /\/api\/attempts\/[^/]+\/events$/.test(response.url()) && response.ok());
      await context.setOffline(false);
      await reconnected;
      await expect(page.getByText(/events ready to sync/)).toHaveText("0 events ready to sync");
      await expect(page.locator(".practice-feedback")).toHaveCount(0);
      if (!await page.getByRole("button", { name: "Submit test" }).isVisible()) await page.getByRole("button", { name: "Open question palette" }).click();
      await page.getByRole("button", { name: "Submit test" }).click();
      const submitted = page.waitForResponse((response) => /\/api\/attempts\/[^/]+\/submit$/.test(response.url()));
      await page.getByRole("button", { name: "Confirm submission" }).click();
      const resultResponse = await submitted;
      expect(resultResponse.ok()).toBe(true);
      const result = await resultResponse.json();
      expect(result.status).toBe("submitted");
      expect(result.result.attemptId).toBe(result.attemptId);
      await page.getByRole("link", { name: "View results" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("region", { name: "Attempt summary" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Solution review" })).toBeVisible();
      await accessible(page);
      const privacy = page.getByRole("checkbox", { name: "Hide my name on public rankings" });
      if (!await privacy.isChecked()) {
        const privacySaved = page.waitForResponse((response) => response.url().endsWith("/api/profile/privacy") && response.request().method() === "PATCH");
        await privacy.check();
        expect((await privacySaved).ok()).toBe(true);
      }
      await page.reload();
      await expect(privacy).toBeChecked();
    } finally { await context.close(); }
  });

  test("published practice immediately reveals and locks the first answer across reload", async ({ browser, baseURL }) => {
    const fixture = publishedBrowserFixture(process.env);
    const context = await browser.newContext({ storageState: fixture.storageState, baseURL });
    await context.addInitScript(() => localStorage.setItem("medmock-locale", "en"));
    const page = await context.newPage();
    try {
      await visit(page, fixture.practicePath);
      await expect(page.getByText("Practice · instant review")).toBeVisible();
      await accessible(page);
      const options = page.locator(".answer-options button");
      await options.first().click();
      await expect(page.getByRole("heading", { name: /^Correct answer:/ })).toBeVisible();
      await options.nth(1).click();
      await expect(options.first()).toHaveAttribute("aria-pressed", "true");
      await expect(options.nth(1)).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByText(/events ready to sync/)).toHaveText("0 events ready to sync");
      await page.reload();
      await expect(options.first()).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("heading", { name: /^Correct answer:/ })).toBeVisible();
    } finally { await context.close(); }
  });

  test("published mock authentication preserves its actual version destination", async ({ page }) => {
    const fixture = publishedBrowserFixture(process.env);
    await page.goto(fixture.mockPath);
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === fixture.mockPath);
  });
});

test("admin import and loaded review screens have protected accessibility coverage", async ({ browser, baseURL }) => {
  const storageState = process.env.E2E_ADMIN_STORAGE_STATE;
  const importId = process.env.E2E_REVIEW_IMPORT_ID;
  test.skip(!storageState || !importId, "Requires a real admin storage state and review import fixture.");
  expect(existsSync(storageState!)).toBe(true);
  const context = await browser.newContext({ storageState, baseURL });
  const page = await context.newPage();
  try {
    await visit(page, "/admin/imports");
    await expect(page.getByLabel("Paper file", { exact: true })).toBeVisible();
    await accessible(page);
    await visit(page, `/admin/imports/${encodeURIComponent(importId!)}`);
    await expect(page.getByRole("textbox", { name: "Complete reviewed paper JSON" })).toBeVisible();
    await accessible(page);
  } finally { await context.close(); }
});
