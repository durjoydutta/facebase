import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "./supabaseClient";
import { getSupabaseServerClient } from "./supabaseServerClient";
import type { Database, UserRole } from "./database.types";

interface AuthContext {
  user: User;
  profile: Database["public"]["Tables"]["users"]["Row"];
}

const assertAdminRole = (role: UserRole | null | undefined) => {
  if (role !== "admin") {
    redirect("/login");
  }
};

export const requireAdmin = async (): Promise<AuthContext> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const adminClient = getSupabaseAdminClient();
  const { data: profile, error } = await adminClient
    .from("users")
    .select("id, auth_user_id, name, email, role, created_at")
    .eq("auth_user_id", user.id)
    .single();

  if (error) {
    redirect("/login");
  }

  assertAdminRole(profile?.role);

  return { user, profile };
};
