"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";

import type {
  DashboardData,
  DashboardFaceRow,
  DashboardUserRow,
  DashboardVisitRow,
} from "@/lib/dashboardData";
import type { VisitStatus } from "@/lib/database.types";

interface DashboardClientProps {
  adminName: string;
  initialData: DashboardData;
}

const fetcher = async (url: string): Promise<DashboardData> => {
  const response = await fetch(url);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(payload?.error ?? "Failed to load dashboard data.");
  }

  return (await response.json()) as DashboardData;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

const AUTO_SYNC_INTERVAL_MS = 60_000;

type UserWithFaces = DashboardUserRow & { faces: DashboardFaceRow[] };

const DashboardClient = ({ adminName, initialData }: DashboardClientProps) => {
  const {
    data,
    error: swrError,
    isValidating,
    mutate,
  } = useSWR<DashboardData>("/api/dashboard", fetcher, {
    fallbackData: initialData,
    refreshInterval: AUTO_SYNC_INTERVAL_MS,
    revalidateOnFocus: true,
  });

  const dashboard = data ?? initialData;
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const [actionError, setActionError] = useState<string | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [deletingSamples, setDeletingSamples] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (data) {
      setLastSyncedAt(new Date());
    }
  }, [data]);

  const statuses = useMemo(() => {
    const totals: Record<VisitStatus, number> = { accepted: 0, rejected: 0 };

    for (const visit of dashboard.visits ?? []) {
      totals[visit.status] += 1;
    }

    return totals;
  }, [dashboard.visits]);

  const usersById = useMemo(() => {
    const map = new Map<string, DashboardUserRow>();
    for (const user of dashboard.users ?? []) {
      map.set(user.id, user);
    }
    return map;
  }, [dashboard.users]);

  const facesByUser = useMemo(() => {
    const map = new Map<string, DashboardFaceRow[]>();

    for (const face of dashboard.faces ?? []) {
      const bucket = map.get(face.user_id);
      if (bucket) {
        bucket.push(face);
      } else {
        map.set(face.user_id, [face]);
      }
    }

    return map;
  }, [dashboard.faces]);

  const usersWithFaces = useMemo<UserWithFaces[]>(() => {
    const users = dashboard.users ?? [];

    return users.map((user) => ({
      ...user,
      faces: facesByUser.get(user.id) ?? [],
    }));
  }, [dashboard.users, facesByUser]);

  const usersWithSamples = useMemo<UserWithFaces[]>(() => {
    return usersWithFaces.filter((user) => user.faces.length > 0);
  }, [usersWithFaces]);

  const handleManualSync = useCallback(async () => {
    try {
      setIsManualSyncing(true);
      setActionError(null);
      await mutate(undefined, { revalidate: true });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to refresh dashboard data."
      );
    } finally {
      setIsManualSyncing(false);
    }
  }, [mutate]);

  const handleDeleteSample = useCallback(
    async (faceId: string) => {
      if (!faceId) {
        return;
      }

      setActionError(null);
      setDeletingSamples((previous) => {
        const clone = new Set(previous);
        clone.add(faceId);
        return clone;
      });

      try {
        const response = await fetch(`/api/faces/${faceId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;

          throw new Error(payload?.error ?? "Failed to delete face sample.");
        }

        await mutate(undefined, { revalidate: true });
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to delete face sample."
        );
      } finally {
        setDeletingSamples((previous) => {
          const clone = new Set(previous);
          clone.delete(faceId);
          return clone;
        });
      }
    },
    [mutate]
  );

  const totalUsers = dashboard.users?.length ?? 0;
  const totalFaceSamples = dashboard.faces?.length ?? 0;
  const totalVisits = dashboard.visits?.length ?? 0;

  const lastSyncedLabel = useMemo(
    () => formatDate(lastSyncedAt.toISOString()),
    [lastSyncedAt]
  );

  return (
    <main className="space-y-10">
      <header className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {adminName}. Monitor usage, review visits, and
              manage your roster.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            <span>
              Last synced:{" "}
              <span className="font-medium text-foreground">
                {lastSyncedLabel}
              </span>
            </span>
            <span>Auto-sync every {AUTO_SYNC_INTERVAL_MS / 1000}s</span>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isManualSyncing}
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition hover:border-primary/80 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60">
              {isManualSyncing ? "Syncing..." : "Sync now"}
            </button>
          </div>
        </div>
        {swrError ? (
          <p className="mt-4 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {swrError.message}
          </p>
        ) : null}
        {actionError ? (
          <p className="mt-2 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-10 px-6 sm:px-10">
        <section>
          <h2 className="text-lg font-semibold">Overview</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">Registered users</p>
              <p className="mt-2 text-3xl font-semibold">{totalUsers}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">
                Recent visits accepted
              </p>
              <p className="mt-2 text-3xl font-semibold">{statuses.accepted}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">
                Recent visits rejected
              </p>
              <p className="mt-2 text-3xl font-semibold">{statuses.rejected}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">
                Face samples stored
              </p>
              <p className="mt-2 text-3xl font-semibold">{totalFaceSamples}</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <p className="text-xs text-muted-foreground">
              Showing last {totalVisits} events.
            </p>
          </header>
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Matched user</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dashboard.visits?.length ? (
                    dashboard.visits.map((visit: DashboardVisitRow) => {
                      const matchedUser = visit.matched_user_id
                        ? usersById.get(visit.matched_user_id)
                        : null;

                      return (
                        <tr key={visit.id}>
                          <td className="px-4 py-3 font-medium capitalize">
                            {visit.status}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(visit.timestamp)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {matchedUser?.name ?? "Unknown"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted-foreground"
                        colSpan={3}>
                        No visits recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">User roster</h2>
              <p className="text-sm text-muted-foreground">
                Latest registered users listed first.
              </p>
            </div>
          </header>
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Face samples</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Added</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usersWithFaces.length ? (
                    usersWithFaces.map((user: UserWithFaces) => (
                      <tr key={user.id}>
                        <td className="px-4 py-3 font-medium">
                          {user.name ?? "Unnamed"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {user.faces.length}
                        </td>
                        <td className="px-4 py-3 capitalize">{user.role}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/register?prefillName=${encodeURIComponent(
                              user.name ?? ""
                            )}&prefillEmail=${encodeURIComponent(user.email)}`}
                            className="text-sm font-medium text-primary underline-offset-2 transition hover:underline">
                            Add samples
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-muted-foreground"
                        colSpan={6}>
                        No users registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Face library</h2>
              <p className="text-sm text-muted-foreground">
                Preview and manage captured reference images per user.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {isValidating ? "Syncing latest samples..." : "Up to date."}
            </p>
          </header>
          {usersWithSamples.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {usersWithSamples.map((user: UserWithFaces) => (
                <article
                  key={user.id}
                  className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold">
                        {user.name ?? "Unnamed"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {user.faces.length} sample
                        {user.faces.length === 1 ? "" : "s"} captured
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-xs">
                      <span className="rounded-full border border-border px-3 py-1 uppercase tracking-[0.2em] text-muted-foreground">
                        {user.role}
                      </span>
                      <Link
                        href={`/register?prefillName=${encodeURIComponent(
                          user.name ?? ""
                        )}&prefillEmail=${encodeURIComponent(user.email)}`}
                        className="font-medium text-primary underline-offset-2 transition hover:underline">
                        Add samples
                      </Link>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {user.faces.slice(0, 3).map((face: DashboardFaceRow) => (
                      <div
                        key={face.id}
                        className="group relative h-24 overflow-hidden rounded-xl border border-border/60 bg-muted">
                        <Image
                          src={face.image_url}
                          alt={`Face sample of ${user.name ?? "user"}`}
                          fill
                          className="object-cover transition group-hover:scale-105"
                          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 180px"
                        />
                        <button
                          type="button"
                          onClick={() => void handleDeleteSample(face.id)}
                          disabled={deletingSamples.has(face.id)}
                          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-background/90 text-destructive shadow-sm transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="Delete face sample">
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round">
                            <path d="M5 5l10 10M15 5l-10 10" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  {user.faces.length > 3 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      +{user.faces.length - 3} more sample
                      {user.faces.length - 3 === 1 ? "" : "s"} stored
                    </p>
                  ) : null}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Last updated{" "}
                    {formatDate(user.faces[0]?.created_at ?? user.created_at)}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center text-sm text-muted-foreground">
              No face samples uploaded yet. Use the register flow to capture
              embeddings.
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default DashboardClient;
