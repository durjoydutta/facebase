import Image from "next/image";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import type { VisitStatus } from "@/lib/database.types";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";

const parseStatus = (raw?: string | string[]): VisitStatus | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }

  if (raw === "accepted" || raw === "rejected") {
    return raw;
  }

  return undefined;
};

const parseDate = (raw?: string | string[]): string | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
};

interface HistoryPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const HistoryPage = async ({ searchParams }: HistoryPageProps) => {
  const { profile } = await requireAdmin();
  const supabase = getSupabaseAdminClient();
  const resolvedParams = searchParams ? await searchParams : {};
  const status = parseStatus(resolvedParams.status);
  const from = parseDate(resolvedParams.from);
  const to = parseDate(resolvedParams.to);

  let query = supabase
    .from("visits")
    .select("id, timestamp, status, image_url, matched_user_id")
    .order("timestamp", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  if (from) {
    query = query.gte("timestamp", from);
  }

  if (to) {
    query = query.lte("timestamp", to);
  }

  const { data: visits, error } = await query;

  if (error) {
    notFound();
  }

  const matchedIds = Array.from(
    new Set(
      (visits ?? []).map((visit) => visit.matched_user_id).filter(Boolean)
    )
  ) as string[];

  const usersResponse = matchedIds.length
    ? await supabase
        .from("users")
        .select("id, name, email")
        .in("id", matchedIds)
    : { data: [] };

  const users = usersResponse.data ?? [];
  const userLookup = new Map(users.map((user) => [user.id, user]));

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 sm:px-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Visit history</h1>
        <p className="text-sm text-muted-foreground">
          Review accepted and rejected attempts
          {profile.name ? ` for ${profile.name}` : ""}.
        </p>
      </header>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-4" action="/history">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">All statuses</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="from">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from ? from.slice(0, 10) : ""}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="to">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to ? to.slice(0, 10) : ""}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90">
              Apply filters
            </button>
            <a
              href="/history"
              className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground">
              Reset
            </a>
          </div>
        </form>
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Snapshot</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Timestamp</th>
              <th className="px-4 py-3 font-medium">Matched user</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visits?.length ? (
              visits.map((visit) => {
                const matched = visit.matched_user_id
                  ? userLookup.get(visit.matched_user_id)
                  : null;

                return (
                  <tr key={visit.id}>
                    <td className="px-4 py-3">
                      {visit.image_url ? (
                        <Image
                          src={visit.image_url}
                          alt={`Visit snapshot ${visit.id}`}
                          width={56}
                          height={56}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No snapshot
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium capitalize">
                      {visit.status}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(visit.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {matched?.name ?? "Unknown"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  className="px-4 py-6 text-center text-muted-foreground"
                  colSpan={4}>
                  No visits recorded for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
};

export default HistoryPage;
