import { createImportReviewHandlers } from "@/features/imports/server/import-review-handlers";
import { SupabaseImportReviewRepository } from "@/features/imports/server/supabase-import-review-repository";

type RouteContext = { params: Promise<{ importId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return createImportReviewHandlers(new SupabaseImportReviewRepository()).GET(
    request,
    context,
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return createImportReviewHandlers(new SupabaseImportReviewRepository()).PATCH(
    request,
    context,
  );
}
