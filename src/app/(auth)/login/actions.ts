"use server";

import { getSupabaseAdminClient } from "@/lib/supabaseClient";

export async function resolveEmailFromUserId(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  
  // Check if the input is a valid UUID to avoid unnecessary queries if it's not
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data.email;
}

export async function resolveEmailFromUsername(username: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("users")
    .select("email")
    .eq("name", username)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.email;
}
