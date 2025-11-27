import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";

import UserDetailClient from "./user-detail-client";

export const dynamic = "force-dynamic";

interface UserPageProps {
  params: Promise<{
    id: string;
  }>;
}

const UserPage = async ({ params }: UserPageProps) => {
  await requireAdmin();
  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  // Fetch user details, faces, and recent visits in parallel
  const [userResult, facesResult, visitsResult] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).single(),
    supabase
      .from("faces")
      .select("id, image_url, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("id, timestamp, status, image_url")
      .eq("matched_user_id", id)
      .order("timestamp", { ascending: false })
      .limit(50), // Initial limit, client can paginate if needed
  ]);

  if (userResult.error || !userResult.data) {
    notFound();
  }

  const user = userResult.data;
  const faces = facesResult.data ?? [];
  const visits = visitsResult.data ?? [];

  return (
    <UserDetailClient
      user={user}
      initialFaces={faces}
      initialVisits={visits}
    />
  );
};

export default UserPage;
