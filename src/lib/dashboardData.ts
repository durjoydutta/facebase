import type { SupabaseAdminClient } from "@/lib/supabaseClient";
import type { VisitStatus } from "@/lib/database.types";

export interface DashboardUserRow {
  id: string;
  name: string | null;
  email: string;
  role: "admin" | "member";
  is_banned: boolean;
  created_at: string;
  last_visit?: { timestamp: string }[];
}

export interface DashboardFaceRow {
  id: string;
  user_id: string;
  image_url: string;
  created_at: string;
}

export interface DashboardVisitRow {
  id: string;
  timestamp: string;
  status: VisitStatus;
  matched_user_id: string | null;
  image_url: string | null;
}

export interface DashboardData {
  users: DashboardUserRow[];
  faces: DashboardFaceRow[];
  visits: DashboardVisitRow[];
  stats: {
    accepted24h: number;
    rejected24h: number;
  };
}

export const fetchDashboardData = async (
  supabase: SupabaseAdminClient
): Promise<DashboardData> => {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    usersResult,
    visitsResult,
    facesResult,
    acceptedResult,
    rejectedResult,
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, is_banned, created_at, last_visit:visits(timestamp)")
      .order("created_at", { ascending: false })
      .order("timestamp", { referencedTable: "visits", ascending: false })
      .limit(1, { foreignTable: "visits" }),
    supabase
      .from("visits")
      .select("id, timestamp, status, matched_user_id, image_url")
      .order("timestamp", { ascending: false })
      .limit(25),
    supabase
      .from("faces")
      .select("id, user_id, image_url, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted")
      .gte("timestamp", twentyFourHoursAgo),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected")
      .gte("timestamp", twentyFourHoursAgo),
  ]);

  if (usersResult.error || visitsResult.error || facesResult.error) {
    throw new Error(
      usersResult.error?.message ??
        visitsResult.error?.message ??
        facesResult.error?.message ??
        "Unable to load dashboard data"
    );
  }

  // Transform usersResult.data to match DashboardUserRow structure if needed
  // The query returns last_visit as an array of objects due to the one-to-many relationship
  const users = (usersResult.data ?? []).map((user: any) => ({
    ...user,
    last_visit: user.last_visit,
  }));

  return {
    users: users as DashboardUserRow[],
    faces: facesResult.data ?? [],
    visits: visitsResult.data ?? [],
    stats: {
      accepted24h: acceptedResult.count ?? 0,
      rejected24h: rejectedResult.count ?? 0,
    },
  };
};
