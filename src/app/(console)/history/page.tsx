import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";

import HistoryClient from "./history-client";

export const dynamic = "force-dynamic";

const HistoryPage = async () => {
  await requireAdmin();
  const supabase = getSupabaseAdminClient();

  // Fetch initial data (page 1, no filters)
  const limit = 20;
  const { data: visits, count } = await supabase
    .from("visits")
    .select("id, timestamp, status, image_url, matched_user_id", {
      count: "exact",
    })
    .order("timestamp", { ascending: false })
    .range(0, limit - 1);

  // Fetch user details for matched visits
  const matchedIds = Array.from(
    new Set(
      (visits ?? []).map((visit) => visit.matched_user_id).filter(Boolean)
    )
  ) as string[];

  const usersResponse = matchedIds.length
    ? await supabase
        .from("users")
        .select("id, name, email")
        .in("id", matchedIds)
    : { data: [] };

  const users = usersResponse.data ?? [];
  const userLookup = new Map(users.map((user) => [user.id, user]));

  const enrichedVisits = (visits ?? []).map((visit) => ({
    ...visit,
    matched_user: visit.matched_user_id
      ? userLookup.get(visit.matched_user_id) ?? null
      : null,
  }));

  return (
    <HistoryClient
      initialVisits={enrichedVisits}
      initialTotal={count ?? 0}
    />
  );
};

export default HistoryPage;
