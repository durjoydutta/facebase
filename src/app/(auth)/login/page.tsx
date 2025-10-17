"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
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

const LoginPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!supabaseClient) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            Supabase configuration required
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Add the Supabase connection variables before using the admin
            console. Create a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              .env.local
            </code>{" "}
            file with:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
            {`NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_PROJECT_URL=your-project-url
SUPABASE_SECRET_KEY=your-service-role-key`}
          </pre>
          {supabaseInitError && (
            <div className="mt-4 rounded-lg border border-border bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {supabaseInitError.message}
            </div>
          )}
        </div>
      </main>
    );
  }

  const supabase = supabaseClient;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setError(null);
    setStatus(null);

    startTransition(async () => {
      if (!email || !password) {
        setError("Email and password are required.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      setStatus("Signed in successfully. Redirecting...");
      router.replace("/dashboard");
    });
  };

  const handleResetPassword = async () => {
    const email = prompt("Enter the admin email to send a reset link");

    if (!email) {
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/auth/update-password`,
      }
    );

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setStatus("Password reset link sent.");
  };

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 sm:px-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin sign in
          </h1>
          <p className="text-sm text-muted-foreground">
            Use your Supabase admin credentials to access the console.
          </p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@example.com"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70">
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="mt-4 space-y-2 text-center text-sm">
          <button
            type="button"
            onClick={handleResetPassword}
            className="text-primary underline-offset-4 transition hover:underline">
            Forgot password?
          </button>
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            <Link href="mailto:security@example.com" className="underline">
              Contact security
            </Link>
            .
          </p>
        </div>
        {(error || status) && (
          <div className="mt-6 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              <p className="text-emerald-600">{status}</p>
            )}
          </div>
        )}
        {supabaseInitError && (
          <div className="mt-4 rounded-lg border border-border bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {supabaseInitError.message}
          </div>
        )}
      </div>
    </main>
  );
};

export default LoginPage;
