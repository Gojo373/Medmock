import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import * as proxyModule from "@/lib/supabase/proxy";

describe("Supabase auth refresh proxy", () => {
  it("persists rotated auth cookies on attempt sync responses", async () => {
    const request = new NextRequest(
      "http://localhost/api/attempts/00000000-0000-4000-8000-000000000001/events",
      { headers: { cookie: "sb-access-token=expired" } },
    );
    const createClient = vi.fn(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (cookies: Array<{
              name: string;
              value: string;
              options: { httpOnly?: boolean };
            }>) => void;
          };
        },
      ) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              {
                name: "sb-access-token",
                value: "rotated-token",
                options: { httpOnly: true },
              },
            ]);
            return { data: { user: { id: "student-1" } }, error: null };
          },
        },
      }),
    );
    const refreshSupabaseSession = (
      proxyModule as typeof proxyModule & {
        refreshSupabaseSession: (
          request: NextRequest,
          dependencies: {
            createClient: typeof createClient;
            environment: { url: string; anonKey: string };
          },
        ) => Promise<Response & { cookies: { get(name: string): { value: string } | undefined } }>;
      }
    ).refreshSupabaseSession;

    const response = await refreshSupabaseSession(request, {
      createClient,
      environment: { url: "https://supabase.example", anonKey: "anon-key" },
    });

    expect(request.cookies.get("sb-access-token")?.value).toBe("rotated-token");
    expect(response.cookies.get("sb-access-token")?.value).toBe("rotated-token");
    expect(createClient).toHaveBeenCalledOnce();
  });
});
