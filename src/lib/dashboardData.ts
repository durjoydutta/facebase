import type { SupabaseAdminClient } from "@/lib/supabaseClient";
import type { VisitStatus } from "@/lib/database.types";

export interface DashboardUserRow {
  id: string;
  name: string | null;
  email: string;
  role: "admin" | "member";
  is_banned: boolean;
  created_at: string;
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
}

export const fetchDashboardData = async (
  supabase: SupabaseAdminClient
): Promise<DashboardData> => {
  const [usersResult, visitsResult, facesResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, is_banned, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("id, timestamp, status, matched_user_id, image_url")
      .order("timestamp", { ascending: false })
      .limit(25),
    supabase
      .from("faces")
      .select("id, user_id, image_url, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (usersResult.error || visitsResult.error || facesResult.error) {
    throw new Error(
      usersResult.error?.message ??
        visitsResult.error?.message ??
        facesResult.error?.message ??
        "Unable to load dashboard data"
    );
  }

  return {
    users: usersResult.data ?? [],
    faces: facesResult.data ?? [],
    visits: visitsResult.data ?? [],
  };
};
