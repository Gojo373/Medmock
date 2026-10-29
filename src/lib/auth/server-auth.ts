export type AuthenticatedUser = {
  id: string;
  role: "admin" | "student";
};

export async function getRequestUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  if (process.env.NODE_ENV === "test") {
    const id = request.headers.get("x-medmock-user-id")?.trim();
    const role = request.headers.get("x-medmock-role")?.trim();

    if (!id || (role !== "admin" && role !== "student")) return null;

    return { id, role };
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) return null;

  const accessToken = authorization.slice("Bearer ".length).trim();

  if (!accessToken) return null;

  try {
    const client = createSupabaseAuthClient(accessToken);
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data.user) return null;

    return {
      id: data.user.id,
      role: data.user.app_metadata.role === "admin" ? "admin" : "student",
    };
  } catch {
    return null;
  }
}
import { createSupabaseAuthClient } from "@/lib/supabase/server";

