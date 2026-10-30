import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", name: "landing" },
  { path: "/sign-in", name: "sign in" },
];

for (const route of routes) {
  test(`${route.name} renders a labelled primary screen`, async ({ page }) => {
    await page.goto(route.path);

    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
  });
}

test("student-facing screens have no serious automated accessibility violations", async ({
  page,
}) => {
  for (const path of ["/", "/sign-in", "/dashboard"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  }
});

for (const path of ["/dashboard", "/admin/imports", "/papers/neet-2025-demo/mock"]) {
  test(`${path} requires authentication instead of passing on redirected content`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });
}

test("authenticated publication, attempt, and privacy journey", async ({ browser }) => {
  const storageState = process.env.E2E_AUTH_STORAGE_STATE;
  const paperId = process.env.E2E_PUBLISHED_PAPER_ID;
  const versionId = process.env.E2E_PUBLISHED_VERSION_ID;
  test.skip(
    !storageState || !paperId || !versionId,
    "Requires Linux/staging authenticated storage state and a published paper fixture.",
  );

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto(`/papers/${paperId}?version=${versionId}`);
  await expect(page.getByRole("link", { name: /start strict mock/i })).toBeVisible();
  await page.getByRole("link", { name: /start strict mock/i }).click();
  await expect(page).toHaveURL(new RegExp(`/papers/${paperId}/mock\\?version=${versionId}`));
  await expect(page.getByText(/answers concealed/i)).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/sign-in/);
  const privacy = page.getByRole("checkbox", {
    name: "Hide my name on public rankings",
  });
  await expect(privacy).toBeVisible();

  await privacy.check();

  await expect(
    page.getByRole("row", { name: /Anonymous aspirant/ }),
  ).toBeVisible();
  await context.close();
});
