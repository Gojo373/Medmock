import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AnalyticsEmptyState,
  AnalyticsShell,
} from "@/features/analytics/analytics-workspace";
import { loadDashboardData } from "@/features/analytics/server/dashboard-store";
import { getRequestUser } from "@/lib/auth/server-auth";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const user = await getRequestUser(
    new Request("http://localhost/dashboard", { headers: requestHeaders }),
  );
  if (!user) redirect("/sign-in?next=/dashboard");

  const dashboard = await loadDashboardData(user.id);
  return dashboard ? <AnalyticsShell {...dashboard} /> : <AnalyticsEmptyState />;
}
