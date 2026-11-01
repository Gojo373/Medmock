import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminImportWorkspace } from "@/features/imports/admin-import-workspace";
import { getRequestUser } from "@/lib/auth/server-auth";

export default async function AdminImportsPage() {
  const requestHeaders = await headers();
  const user = await getRequestUser(
    new Request("http://localhost/admin/imports", { headers: requestHeaders }),
  );
  if (!user) redirect("/sign-in?next=/admin/imports");
  if (user.role !== "admin") redirect("/dashboard");

  const availableProviders: Array<"openai" | "gemini"> = [];
  if (
    process.env.OPENAI_IMPORTS_ENABLED === "true" &&
    process.env.OPENAI_API_KEY?.trim()
  ) {
    availableProviders.push("openai");
  }
  if (process.env.GEMINI_API_KEY?.trim()) availableProviders.push("gemini");
  return <AdminImportWorkspace availableProviders={availableProviders} />;
}
