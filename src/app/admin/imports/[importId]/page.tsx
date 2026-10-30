import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminImportReview } from "@/features/imports/admin-import-review";
import { getRequestUser } from "@/lib/auth/server-auth";

export default async function AdminImportReviewPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const requestHeaders = await headers();
  const user = await getRequestUser(
    new Request("http://localhost/admin/imports/review", { headers: requestHeaders }),
  );
  if (!user) redirect("/sign-in?next=/admin/imports");
  if (user.role !== "admin") redirect("/dashboard");
  const { importId } = await params;
  return <AdminImportReview importId={importId} />;
}
