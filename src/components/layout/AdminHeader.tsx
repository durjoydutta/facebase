"use client";

import { useEffect, useRef, useState } from "react";
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

          {isMobileNavOpen ? (
            <div
              ref={menuRef}
              className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-40 sm:hidden">
              <div className="rounded-2xl border border-border/80 bg-card/95 shadow-xl shadow-primary/10 backdrop-blur">
                <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {profile.name ?? profile.email}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {profile.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMobileNavOpen(false)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border"
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
                <nav className="max-h-[60vh] overflow-y-auto px-4 py-4">
                  <ul className="space-y-3">
                    {navItems.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setIsMobileNavOpen(false)}
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition",
                            pathname === item.href
                              ? "border-primary/70 bg-primary text-primary-foreground"
                              : "border-border/70 bg-card text-foreground hover:border-primary/60 hover:bg-muted/70"
                          )}>
                          <span>{item.label}</span>
                          <svg
                            className="h-4 w-4 opacity-60"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round">
                            <path d="M7 5l5 5-5 5" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="border-t border-border/70 px-5 py-4">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsMobileNavOpen(false);
                      await handleSignOut();
                    }}
                    disabled={signingOut || !supabase}
                    className="flex w-full items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-semibold transition hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-70">
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
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
