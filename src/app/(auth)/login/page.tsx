"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowserClient";
import { resolveEmailFromUserId, resolveEmailFromUsername } from "./actions";
import { LoadingOverlay } from "@/components/LoadingOverlay";

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
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [isSigningIn, startSignInTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const supabase = supabaseClient;

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/dashboard");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  if (!supabase) {
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    setLoadingText("Signing in...");
    startSignInTransition(async () => {
      try {
        const trimmedIdentifier = identifier.trim();

      if (!trimmedIdentifier || !password) {
        setError("Email/User ID and password are required.");
        return;
      }

      let finalEmail = trimmedIdentifier;
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedIdentifier);

      if (!isEmail) {
        let resolvedEmail: string | null = null;

        if (isUuid) {
          resolvedEmail = await resolveEmailFromUserId(trimmedIdentifier);
        } else {
          resolvedEmail = await resolveEmailFromUsername(trimmedIdentifier);
        }

        if (!resolvedEmail) {
          setError("Invalid User ID, Username, or Email.");
          return;
        }
        finalEmail = resolvedEmail;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      setStatus("Signed in successfully. Redirecting...");
      router.replace("/dashboard");
      } finally {
        setLoadingText(null);
      }
    });
  };

  const handleResetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    setLoadingText("Sending reset link...");
    startResetTransition(async () => {
      try {
        const targetEmail = (resetEmail || identifier).trim();

      if (!targetEmail) {
        setError("Enter the admin email to send a reset link.");
        return;
      }

      const deployedUrl = process.env.NEXT_DEPLOYED_URL?.replace(/\/$/, "");
      const fallbackUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/update-password`
          : undefined;
      const redirectTo = deployedUrl
        ? `${deployedUrl}/update-password`
        : fallbackUrl;
      const resetOptions = redirectTo ? { redirectTo } : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        targetEmail,
        resetOptions
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setStatus("Password reset link sent.");
      setShowResetForm(false);
      setResetEmail("");
      } finally {
        setLoadingText(null);
      }
    });
  };

  const toggleResetForm = () => {
    setError(null);
    setStatus(null);
    setShowResetForm((previous) => {
      if (previous) {
        setResetEmail("");
        return false;
      }

      // Only pre-fill if it looks like an email
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
      setResetEmail((value) => value || (isEmail ? identifier.trim() : ""));
      return true;
    });
  };

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 sm:px-10 relative">
      <LoadingOverlay isLoading={!!loadingText} message={loadingText || ""} fullScreen />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Admin Login</h1>
          <p className="text-sm text-muted-foreground">
            Use your Supabase admin credentials to access the console.
          </p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium" htmlFor="identifier">
              Username or Email
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="ddc or ddc@team7.com"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={isSigningIn}
            className="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70">
            {isSigningIn ? "Signing In..." : "SignIn"}
          </button>
        </form>
        <div className="mt-4 space-y-2 text-center text-sm">
          <button
            type="button"
            onClick={toggleResetForm}
            className="text-primary underline-offset-4 transition hover:underline">
            {showResetForm ? "Back To Sign In" : "Forgot Password?"}
          </button>
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            <Link href="mailto:security@example.com" className="underline">
              Contact Security
            </Link>
            .
          </p>
        </div>
        {showResetForm ? (
          <div className="mt-6 space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-left">
            <div>
              <h2 className="text-sm font-semibold">Send a reset link</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter the email associated with your admin account and we will
                send a secure link to update the password.
              </p>
            </div>
            <form className="space-y-3" onSubmit={handleResetPassword}>
              <div className="space-y-2">
                <label className="text-xs font-medium" htmlFor="reset-email">
                  Admin email
                </label>
                <input
                  id="reset-email"
                  name="reset-email"
                  type="email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isResetting}
                className="flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70">
                {isResetting ? "Sending link..." : "Email reset link"}
              </button>
            </form>
          </div>
        ) : null}
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
