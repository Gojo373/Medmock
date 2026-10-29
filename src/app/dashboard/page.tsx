import { analyticsDemo } from "@/features/analytics/analytics-demo";
import { AnalyticsShell } from "@/features/analytics/analytics-workspace";

export default function DashboardPage() {
  return <AnalyticsShell {...analyticsDemo} />;
}
