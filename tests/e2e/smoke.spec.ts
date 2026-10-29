import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", name: "landing" },
  { path: "/sign-in", name: "sign in" },
  { path: "/admin/imports", name: "admin import review" },
  { path: "/papers/neet-2025-demo/mock", name: "strict mock" },
  { path: "/papers/neet-2025-demo/practice", name: "practice" },
  { path: "/dashboard", name: "results dashboard" },
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

test("local leaderboard privacy hides the current display name", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("row", { name: /You/ })).toBeVisible();

  await page
    .getByRole("checkbox", { name: "Hide my name on public rankings" })
    .check();

  await expect(
    page.getByRole("row", { name: /Anonymous aspirant/ }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /You/ })).toHaveCount(0);
});
