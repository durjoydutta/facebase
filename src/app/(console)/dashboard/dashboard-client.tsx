"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ChevronRight, Loader2, MoreHorizontal, Search, Shield, ShieldAlert, Trash2, User } from "lucide-react";

import type {
  DashboardData,
  DashboardUserRow,
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

const DashboardClient = ({ adminName, initialData }: DashboardClientProps) => {
  const router = useRouter();
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
  const [isManualSyncing, setIsManualSyncing] = useState(false);

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

  const usersWithStats = useMemo(() => {
    const users = dashboard.users ?? [];
    const faceCounts = new Map<string, number>();
    const facesByUser = new Map<string, string[]>();
    const lastVisits = new Map<string, string>();

    for (const face of dashboard.faces ?? []) {
      faceCounts.set(face.user_id, (faceCounts.get(face.user_id) ?? 0) + 1);
      
      const userFaces = facesByUser.get(face.user_id) ?? [];
      if (userFaces.length < 3) {
        userFaces.push(face.image_url);
        facesByUser.set(face.user_id, userFaces);
      }
    }

    // Visits are ordered by timestamp desc in fetchDashboardData
    for (const visit of dashboard.visits ?? []) {
      if (visit.matched_user_id && !lastVisits.has(visit.matched_user_id)) {
        lastVisits.set(visit.matched_user_id, visit.timestamp);
      }
    }

    return users.map((user) => {
      // Use the explicitly fetched last_visit if available, otherwise fall back to the recent visits list
      const fetchedLastSeen = user.last_visit?.[0]?.timestamp;
      const listLastSeen = lastVisits.get(user.id);
      
      // Prefer the fetched one as it's more accurate (not limited to top 25)
      // But if we have a newer one in the live list (e.g. from real-time update), use that?
      // Actually, since we just fetched everything, the fetched one is accurate.
      // However, if we receive real-time updates, `dashboard.visits` might update.
      // Let's take the max of both if both exist, or whichever exists.
      
      let lastSeen = fetchedLastSeen ?? listLastSeen ?? null;
      
      if (fetchedLastSeen && listLastSeen) {
         lastSeen = new Date(fetchedLastSeen) > new Date(listLastSeen) ? fetchedLastSeen : listLastSeen;
      }

      return {
        ...user,
        faceCount: faceCounts.get(user.id) ?? 0,
        recentFaces: facesByUser.get(user.id) ?? [],
        lastSeen,
      };
    });
  }, [dashboard]);

  const [searchQuery, setSearchQuery] = useState("");

  const { admins, members } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = usersWithStats.filter(
      (u) =>
        u.name?.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
    );

    return {
      admins: filtered.filter((u) => u.role === "admin"),
      members: filtered.filter((u) => u.role !== "admin"),
    };
  }, [usersWithStats, searchQuery]);

  const handleManualSync = useCallback(async () => {
    try {
      setIsManualSyncing(true);
      await mutate(undefined, { revalidate: true });
    } catch (error) {
      console.error("Failed to refresh dashboard data", error);
    } finally {
      setIsManualSyncing(false);
    }
  }, [mutate]);

  const totalUsers = dashboard.users?.length ?? 0;
  const totalFaceSamples = dashboard.faces?.length ?? 0;

  const lastSyncedLabel = useMemo(
    () => formatDate(lastSyncedAt.toISOString()),
    [lastSyncedAt]
  );

  return (
    <main className="space-y-8 pb-10">
      <header className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {adminName}. Overview of your secure facility.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            <span>
              Last synced:{" "}
              <span className="font-medium text-foreground">
                {lastSyncedLabel}
              </span>
            </span>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isManualSyncing}
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition hover:border-primary/80 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60">
              {isManualSyncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>
        {swrError ? (
          <p className="mt-4 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {swrError.message}
          </p>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-8 px-6 sm:px-10">
        <section>
          <h2 className="sr-only">Statistics</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Users
                  </p>
                  <p className="text-2xl font-bold">{totalUsers}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Access Granted (24h)
                  </p>
                  <p className="text-2xl font-bold">
                    {dashboard.stats?.accepted24h ?? 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Access Denied (24h)
                  </p>
                  <p className="text-2xl font-bold">
                    {dashboard.stats?.rejected24h ?? 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Face Samples
                  </p>
                  <p className="text-2xl font-bold">{totalFaceSamples}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold">Users</h2>
              <p className="text-sm text-muted-foreground">
                Manage access and view individual history.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Admins Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Administrators ({admins.length})
            </h3>
            {admins.length ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {admins.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onRefresh={() => mutate()}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No administrators found.
              </p>
            )}
          </div>

          {/* Members Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Members ({members.length})
            </h3>
            {members.length ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    onRefresh={() => mutate()}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No members found.
              </p>
            )}
          </div>

          {!admins.length && !members.length && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No users found matching &quot;{searchQuery}&quot;.
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default DashboardClient;

const UserCard = ({
  user,
  onRefresh,
}: {
  user: any;
  onRefresh: () => void;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleBan = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${user.id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanned: !user.is_banned }),
      });

      if (!response.ok) throw new Error("Failed to update ban status");
      onRefresh();
    } catch (error) {
      console.error(error);
      alert("Failed to update ban status");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        "Are you sure you want to delete this user? This action cannot be undone."
      )
    )
      return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete user");
      onRefresh();
    } catch (error) {
      console.error(error);
      alert("Failed to delete user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Link
      href={`/users/${user.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50 hover:shadow-md">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-foreground">
                {user.name ?? "Unnamed"}
              </div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
          {user.is_banned ? (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
              Banned
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
              Active
            </span>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-foreground">{user.role}</span>
          </div>
          <div>
            Last seen:{" "}
            <span className="font-medium text-foreground">
              {user.lastSeen ? formatDate(user.lastSeen) : "Never"}
            </span>
          </div>
        </div>

        {/* Face Thumbnails */}
        <div className="mt-6 flex items-center gap-2">
          {user.recentFaces.length > 0 ? (
            user.recentFaces.map((faceUrl: string, idx: number) => (
              <div
                key={idx}
                className="relative h-10 w-10 overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={faceUrl}
                  alt="Face sample"
                  className="h-full w-full object-cover"
                />
              </div>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              No face samples
            </span>
          )}
          {user.faceCount > 3 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted text-xs font-medium text-muted-foreground">
              +{user.faceCount - 3}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground group-hover:bg-primary/5">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBan}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition ${
              user.is_banned
                ? "text-emerald-600 hover:bg-emerald-500/10"
                : "text-orange-600 hover:bg-orange-500/10"
            }`}>
            {user.is_banned ? (
              <>
                <Shield className="h-3.5 w-3.5" />
                Unban
              </>
            ) : (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                Ban
              </>
            )}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-destructive transition hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
        <div className="flex items-center gap-1 text-primary opacity-0 transition group-hover:opacity-100">
          Details
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
};
