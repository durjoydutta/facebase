"use client";

import { FormEvent, useState, useTransition } from "react";
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

const UpdatePasswordPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!supabaseClient) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            Supabase configuration required
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Set the Supabase environment variables in your
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              .env.local
            </code>
            file before updating passwords.
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
    const password = String(formData.get("password") ?? "");

    setError(null);
    setStatus(null);

    startTransition(async () => {
      if (!password || password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setStatus("Password updated. Redirecting to dashboard...");
      router.replace("/dashboard");
      router.refresh();
    });
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16 sm:px-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70">
            {isPending ? "Updating..." : "Update password"}
          </button>
        </form>
        {(error || status) && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              <p className="text-emerald-600">{status}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
};

export default UpdatePasswordPage;
