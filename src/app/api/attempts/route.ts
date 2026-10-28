import {
  CreateAttemptRequestSchema,
  CreateAttemptResponseSchema,
} from "@/features/exam/contracts";
import { createAttemptRecord } from "@/features/exam/server/attempt-store";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = CreateAttemptRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_attempt_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = createAttemptRecord(parsed.data, "demo-user", Date.now());

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
