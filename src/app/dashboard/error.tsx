"use client";

import { AnalyticsErrorState } from "@/features/analytics/analytics-workspace";

export default function DashboardError({ retry }: { retry: () => void }) {
  return <AnalyticsErrorState retry={retry} />;
}
