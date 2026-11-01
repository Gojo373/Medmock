import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithOAuth: vi.fn(), signInWithOtp: vi.fn() }));
vi.mock("@/lib/supabase/route-client", () => ({ createSupabaseRouteClient: () => ({ client: { auth }, applyCookies: (response: NextResponse) => response }) }));
import { GET as google } from "@/app/api/auth/google/route";
import { POST as otp } from "@/app/api/auth/otp/route";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("authentication return destination", () => {
  it.each(["/papers/neet/mock?version=current-2", "//evil.example", "/\\evil.example"])("preserves only validated internal destinations: %s", async (next) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://medmock.example");
    auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/auth" }, error: null });
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await google(new NextRequest(`https://medmock.example/api/auth/google?next=${encodeURIComponent(next)}`));
    const otpResponse = await otp(new NextRequest("https://medmock.example/api/auth/otp", { method: "POST", body: JSON.stringify({ email: "student@example.com", next }) }));
    expect(otpResponse.status).toBe(200);
    const destination = next.startsWith("/papers/") ? next : "/dashboard";
    expect(new URL(auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).searchParams.get("next")).toBe(destination);
    expect(new URL(auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).searchParams.get("next")).toBe(destination);
  });
});
