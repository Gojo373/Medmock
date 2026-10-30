import { createImportPublishHandler } from "@/features/imports/server/import-review-handlers";
import { SupabaseImportReviewRepository } from "@/features/imports/server/supabase-import-review-repository";

type RouteContext = { params: Promise<{ importId: string }> };

export async function POST(request: Request, context: RouteContext) {
  return createImportPublishHandler(new SupabaseImportReviewRepository())(
    request,
    context,
  );
}
