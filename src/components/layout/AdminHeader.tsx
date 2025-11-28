"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
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
  const menuRef = useRef<HTMLDivElement | null>(null);
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
    if (typeof document === "undefined" || !isMobileNavOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMobileNavOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMobileNavOpen]);

  return (
    <header className="border-b border-border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="mx-auto w-full max-w-6xl px-6 py-4 sm:px-10">
        <div className="relative flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative h-16 w-16 overflow-hidden rounded-xl transition-transform hover:scale-105">
              <Image
                src="/logo.png"
                alt="FaceBase"
                fill
                className="object-cover"
              />
            </div>
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
              onClick={() => setIsMobileNavOpen((previous) => !previous)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border sm:hidden"
              aria-label={
                isMobileNavOpen ? "Close navigation" : "Open navigation"
              }
              aria-expanded={isMobileNavOpen}>
              {isMobileNavOpen ? (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round">
                  <path d="M5 5l10 10M15 5l-10 10" />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round">
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              )}
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

          {/* Mobile Navigation Overlay */}
          {/* Mobile Navigation Overlay */}
          {isMobileNavOpen && typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[9999] flex flex-col bg-background/95 backdrop-blur-xl sm:hidden animate-in fade-in slide-in-from-top-5 duration-300">
              <div className="mx-auto w-full max-w-6xl px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                      <Image
                        src="/logo.png"
                        alt="FaceBase"
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors"
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
              </div>
              
              <div className="w-full border-b border-border" />

              <div className="flex-1 overflow-y-auto px-6 py-8">
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                      {(profile.name?.[0] ?? profile.email[0]).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">
                        {profile.name ?? profile.email}
                      </p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {profile.role} Access
                      </p>
                    </div>
                  </div>
                </div>

                <nav className="space-y-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileNavOpen(false)}
                      className={cn(
                        "flex items-center justify-between rounded-xl p-4 text-base font-medium transition-all",
                        pathname === item.href
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                          : "bg-muted/50 text-foreground hover:bg-muted"
                      )}>
                      {item.label}
                      <svg
                        className="h-5 w-5 opacity-50"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="border-t border-border p-6 bg-muted/20">
                <button
                  type="button"
                  onClick={async () => {
                    setIsMobileNavOpen(false);
                    await handleSignOut();
                  }}
                  disabled={signingOut || !supabase}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive/10 p-4 text-destructive font-semibold transition-colors hover:bg-destructive/20 disabled:opacity-50">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  {signingOut ? "Signing out..." : "Sign Out"}
                </button>
                {!supabase && (
                  <p className="mt-3 text-center text-xs text-destructive/80">
                    Supabase not configured
                  </p>
                )}
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
