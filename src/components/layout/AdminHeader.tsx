"use client";

import { useEffect, useState } from "react";
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (!isMobileNavOpen) {
      document.body.style.removeProperty("overflow");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.removeProperty("overflow");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileNavOpen]);

  return (
    <header className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="text-lg font-semibold">
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
          <button
            type="button"
            onClick={() => setIsMobileNavOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border sm:hidden"
            aria-label="Open navigation"
            aria-expanded={isMobileNavOpen}>
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round">
              <path d="M3 6h14M3 10h14M3 14h14" />
            </svg>
          </button>
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
      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-sm sm:hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="text-base font-semibold">
                {profile.name ?? profile.email}
              </div>
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border"
                aria-label="Close navigation">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round">
                  <path d="M5 5l10 10M15 5l-10 10" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-2 px-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileNavOpen(false)}
                  className={cn(
                    "rounded-xl border border-border px-4 py-3 text-base font-medium transition",
                    pathname === item.href
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground hover:bg-muted/70"
                  )}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={async () => {
                  setIsMobileNavOpen(false);
                  await handleSignOut();
                }}
                disabled={signingOut || !supabase}
                className="w-full rounded-full border border-border px-4 py-3 text-sm font-semibold transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70">
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
              {!supabase && (
                <p className="mt-2 text-center text-xs text-destructive">
                  Configure Supabase env vars to enable sign out
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
};

export default AdminHeader;
