import { z } from "zod";

import {
  PublishImportRequestSchema,
  ReviewImportRequestSchema,
} from "@/features/imports/contracts";
import {
  publishReviewedImport,
  reviewImport,
  type ImportReviewRepository,
} from "@/features/imports/server/import-review-service";
import { getRequestUser } from "@/lib/auth/server-auth";
import { logServerEvent } from "@/lib/server/logger";

type RouteContext = { params: Promise<{ importId: string }> };

type ReviewAuthorization =
  | { ok: false; response: Response }
  | { ok: true; importId: string; user: { id: string; role: "admin" } };

async function authorize(
  request: Request,
  context: RouteContext,
): Promise<ReviewAuthorization> {
  const user = await getRequestUser(request);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  const { importId } = await context.params;
  const parsedId = z.string().uuid().safeParse(importId);
  if (!parsedId.success) {
    return {
      ok: false,
      response: Response.json({ error: "invalid_import_id" }, { status: 400 }),
    };
  }
  return {
    ok: true,
    user: { id: user.id, role: "admin" },
    importId: parsedId.data,
  };
}

export function createImportReviewHandlers(repository: ImportReviewRepository) {
  return {
    async GET(request: Request, context: RouteContext) {
      const authorization = await authorize(request, context);
      if (!authorization.ok) return authorization.response;

      try {
        const record = await repository.get(authorization.importId);
        if (!record) {
          return Response.json({ error: "import_not_found" }, { status: 404 });
        }
        return Response.json({
          importId: authorization.importId,
          status: record.status,
          document: record.reviewed ?? record.reconciled,
          canPublish:
            record.status === "ready_to_publish" || record.status === "published",
        });
      } catch {
        logServerEvent("error", "import.review_read_failed", {
          importId: authorization.importId,
        });
        return Response.json({ error: "service_unavailable" }, { status: 503 });
      }
    },

    async PATCH(request: Request, context: RouteContext) {
      const authorization = await authorize(request, context);
      if (!authorization.ok) return authorization.response;
      const payload = await request.json().catch(() => null);
      const parsed = ReviewImportRequestSchema.safeParse(payload);
      if (!parsed.success) {
        return Response.json(
          { error: "invalid_review_decisions", issues: parsed.error.issues },
          { status: 400 },
        );
      }

      try {
        const result = await reviewImport(
          repository,
          authorization.importId,
          parsed.data.decisions,
        );
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "Import was not found.") {
          return Response.json({ error: "import_not_found" }, { status: 404 });
        }
        if (message === "Published imports cannot be changed.") {
          return Response.json({ error: "import_immutable" }, { status: 409 });
        }
        logServerEvent("error", "import.review_update_failed", {
          importId: authorization.importId,
        });
        return Response.json({ error: "review_failed" }, { status: 409 });
      }
    },
  };
}

export function createImportPublishHandler(repository: ImportReviewRepository) {
  return async function POST(request: Request, context: RouteContext) {
    const user = await getRequestUser(request);
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const { importId } = await context.params;
    const parsedId = z.string().uuid().safeParse(importId);
    if (!parsedId.success) {
      return Response.json({ error: "invalid_import_id" }, { status: 400 });
    }
    const payload = await request.json().catch(() => null);
    const parsed = PublishImportRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_publish_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    try {
      const result = await publishReviewedImport(
        repository,
        parsedId.data,
        user.id,
        parsed.data,
      );
      logServerEvent("info", "import.published", {
        importId: parsedId.data,
        ownerId: user.id,
      });
      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Import was not found.") {
        return Response.json({ error: "import_not_found" }, { status: 404 });
      }
      if (message === "Import is not ready to publish.") {
        return Response.json({ error: "import_not_ready" }, { status: 409 });
      }
      logServerEvent("error", "import.publish_failed", {
        importId: parsedId.data,
        ownerId: user.id,
      });
      return Response.json({ error: "publish_failed" }, { status: 409 });
    }
  };
}
