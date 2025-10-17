import {
  getSupabaseAdminClient,
  type SupabaseAdminClient,
} from "@/lib/supabaseClient";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";

export interface AdminSessionSuccess {
  ok: true;
  adminClient: SupabaseAdminClient;
  authUserId: string;
  profileId: string;
}

export interface AdminSessionFailure {
  ok: false;
  status: number;
  message: string;
}

export const resolveAdminSession = async (): Promise<
  AdminSessionSuccess | AdminSessionFailure
> => {
  try {
    const supabaseServer = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseServer.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
      };
    }

    const adminClient = getSupabaseAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      return {
        ok: false,
        status: 403,
        message: "Forbidden",
      };
    }

    return {
      ok: true,
      adminClient,
      authUserId: user.id,
      profileId: profile.id,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to resolve admin session";

    return {
      ok: false,
      status: 500,
      message,
    };
  }
};
