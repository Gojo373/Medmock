import "server-only";

import { buildDashboardDataFromRows } from "@/features/analytics/analytics";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function loadAttemptEvents(
  client: ReturnType<typeof createSupabaseAdminClient>,
  attemptIds: string[],
) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1_000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("answer_events")
      .select(
        "attempt_id, id, question_id, event_type, selected_option_id, occurred_at_ms, client_sequence, time_spent_ms",
      )
      .in("attempt_id", attemptIds)
      .order("client_sequence", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

export async function loadDashboardData(userId: string) {
  const client = createSupabaseAdminClient();
  const [profileResponse, attemptsResponse] = await Promise.all([
    client
      .from("profiles")
      .select("hide_display_name")
      .eq("id", userId)
      .single(),
    client
      .from("attempts")
      .select(
        "id, user_id, paper_version_id, mode, strict, attempt_number, visibility, integrity_status, started_at, deadline_at, submitted_at",
      )
      .eq("user_id", userId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(50),
  ]);

  if (profileResponse.error) throw profileResponse.error;
  if (attemptsResponse.error) throw attemptsResponse.error;

  const attemptRows = (attemptsResponse.data ?? []) as Record<string, unknown>[];
  if (attemptRows.length === 0) return undefined;

  const attemptIds = attemptRows.map((row) => String(row.id));
  const paperVersionIds = Array.from(
    new Set(attemptRows.map((row) => String(row.paper_version_id))),
  );
  const [resultsResponse, papersResponse, eventRows] = await Promise.all([
    client
      .from("attempt_results")
      .select("attempt_id, result")
      .in("attempt_id", attemptIds),
    client
      .from("paper_versions")
      .select("id, content")
      .in("id", paperVersionIds),
    loadAttemptEvents(client, attemptIds),
  ]);

  if (resultsResponse.error) throw resultsResponse.error;
  if (papersResponse.error) throw papersResponse.error;

  const currentPaperVersionId = String(attemptRows[0].paper_version_id);
  const { data: leaderboardRows, error: leaderboardError } = await client.rpc(
    "get_leaderboard",
    { p_paper_version_id: currentPaperVersionId },
  );
  if (leaderboardError) throw leaderboardError;

  return buildDashboardDataFromRows({
    userId,
    profile: profileResponse.data,
    attemptRows,
    resultRows: (resultsResponse.data ?? []) as Record<string, unknown>[],
    paperRows: (papersResponse.data ?? []) as Record<string, unknown>[],
    eventRows,
    leaderboardRows: (leaderboardRows ?? []) as Record<string, unknown>[],
  });
}
