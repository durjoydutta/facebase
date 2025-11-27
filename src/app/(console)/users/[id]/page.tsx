import { notFound } from "next/navigation";
import { PostgrestSingleResponse } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/auth";
import { Database } from "@/lib/database.types";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";

import UserDetailClient from "./user-detail-client";

export const dynamic = "force-dynamic";

interface UserPageProps {
  params: Promise<{
    id: string;
  }>;
}

type UserRow = Database["public"]["Tables"]["users"]["Row"];

const UserPage = async ({ params }: UserPageProps) => {
  await requireAdmin();
  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  // Fetch user details first to handle 404 early and ensure type inference
  const userResult = (await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single()) as PostgrestSingleResponse<UserRow>;

  if (userResult.error || !userResult.data) {
    notFound();
  }

  const user: UserRow = userResult.data;

  // Fetch faces and visits in parallel
  const [facesResult, visitsResult] = await Promise.all([
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
