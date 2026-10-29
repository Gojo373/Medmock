import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/route-client", () => ({
  createSupabaseRouteClient: () => ({
    client: {
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
    },
    applyCookies: (response: NextResponse) => response,
  }),
}));

import { GET } from "@/app/api/auth/callback/route";

describe("auth callback", () => {
  it("rejects scheme-relative and backslash redirects", async () => {
    for (const next of ["//evil.example", "/\\evil.example"]) {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/auth/callback?code=valid&next=${encodeURIComponent(next)}`,
        ),
      );

      expect(response.headers.get("location")).toBe("http://localhost/dashboard");
    }
  });
});
