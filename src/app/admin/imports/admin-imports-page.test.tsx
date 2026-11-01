import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => routeState.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  },
}));

import AdminImportsPage from "@/app/admin/imports/page";

beforeEach(() => {
  routeState.headers = new Headers();
  process.env.GEMINI_API_KEY = "gemini-key";
  process.env.OPENAI_API_KEY = "openai-key";
  process.env.OPENAI_IMPORTS_ENABLED = "false";
});

describe("admin imports page", () => {
  it("requires an authenticated admin and exposes only enabled providers", async () => {
    await expect(Promise.resolve().then(() => AdminImportsPage())).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?next=/admin/imports",
    );

    routeState.headers = new Headers({
      "x-medmock-user-id": "student-1",
      "x-medmock-role": "student",
    });
    await expect(Promise.resolve().then(() => AdminImportsPage())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );

    routeState.headers = new Headers({
      "x-medmock-user-id": "admin-1",
      "x-medmock-role": "admin",
    });
    const element = await AdminImportsPage();
    expect(element.props.availableProviders).toEqual(["gemini"]);
  });
});
