"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowserClient";
import { cn } from "@/lib/utils";

let supabaseInitError: Error | null = null;
let supabaseClient: SupabaseClient<Database> | null = null;

try {
  supabaseClient = getSupabaseBrowserClient();
} catch (error) {
  supabaseInitError = error instanceof Error ? error : new Error(String(error));
}

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/register", label: "Register" },
  { href: "/recognize", label: "Recognize" },
  { href: "/history", label: "History" },
];

interface AdminHeaderProps {
  profile: Database["public"]["Tables"]["users"]["Row"];
}

const AdminHeader = ({ profile }: AdminHeaderProps) => {
  const router = useRouter();
  const pathname = usePathname();
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
    <header className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/dashboard" className="text-lg font-semibold">
          FaceBase Admin
        </Link>
        <nav className="hidden items-center gap-2 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                pathname === item.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold">
              {profile.name ?? profile.email}
            </p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
          {!supabase && (
            <span className="hidden text-xs text-destructive sm:inline">
              Configure Supabase env vars to enable sign out
            </span>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut || !supabase}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70">
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
