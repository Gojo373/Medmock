import {
  CreateAttemptRequestSchema,
  CreateAttemptResponseSchema,
} from "@/features/exam/contracts";
import { createAttemptRecord } from "@/features/exam/server/attempt-store";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";

export async function POST(request: Request) {
  const user = await getRequestUser(request);

  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = CreateAttemptRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_attempt_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let result;

  try {
    result = await createAttemptRecord(parsed.data, user.id, Date.now());
  } catch {
    logServerEvent("error", "attempt.create_failed", { userId: user.id });
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }

  if (!result.ok) {
    if (result.error === "paper_not_found") {
      return Response.json({ error: result.error }, { status: 404 });
    }

    return Response.json({ error: result.error }, { status: 409 });
  }

  return Response.json(CreateAttemptResponseSchema.parse(result.response), {
    status: result.replayed ? 200 : 201,
  });
}
