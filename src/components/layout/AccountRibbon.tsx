"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowserClient";

let supabaseInitError: Error | null = null;
let supabaseClient: SupabaseClient<Database> | null = null;

try {
  supabaseClient = getSupabaseBrowserClient();
} catch (error) {
  supabaseInitError = error instanceof Error ? error : new Error(String(error));
}

interface AccountRibbonProps {
  profile: Database["public"]["Tables"]["users"]["Row"];
}

const AccountRibbon = ({ profile }: AccountRibbonProps) => {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const supabase = supabaseClient;

  const handleSignOut = async () => {
    if (!supabase) {
      console.error(
        supabaseInitError?.message ??
          "Supabase environment variables are not configured."
      );
      return;
    }

    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="flex items-center gap-3 rounded-full border border-border bg-card/80 px-4 py-2 text-sm shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90">
      <div className="text-left">
        <p className="font-semibold">{profile.name ?? profile.email}</p>
        <p className="text-xs text-muted-foreground capitalize">
          {profile.role}
        </p>
      </div>
      {!supabase && (
        <span className="text-xs text-destructive">
          Configure Supabase env vars to enable sign out
        </span>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut || !supabase}
        className="rounded-full border border-border px-3 py-1 text-xs font-semibold transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70">
        {signingOut ? "SigningOut..." : "Sign Out"}
      </button>
    </div>
  );
};

export default AccountRibbon;
