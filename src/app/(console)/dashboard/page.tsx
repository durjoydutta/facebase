import Image from "next/image";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import type { VisitStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

const DashboardSummary = async () => {
  const supabase = getSupabaseAdminClient();
  const [
    { data: users, error: usersError },
    { data: visits, error: visitsError },
    { data: faces, error: facesError },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("id, timestamp, status, matched_user_id")
      .order("timestamp", { ascending: false })
      .limit(10),
    supabase
      .from("faces")
      .select("id, user_id, image_url, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (usersError || visitsError || facesError) {
    throw new Error(
      usersError?.message ??
        visitsError?.message ??
        facesError?.message ??
        "Unable to load dashboard data"
    );
  }

  const totalUsers = users?.length ?? 0;
  const totalFaceSamples = faces?.length ?? 0;
  const statuses = visits?.reduce<Record<VisitStatus, number>>(
    (acc, visit) => {
      acc[visit.status] += 1;
      return acc;
    },
    { accepted: 0, rejected: 0 }
  ) ?? { accepted: 0, rejected: 0 };
  type Face = NonNullable<typeof faces>[number];
  const facesByUser = new Map<string, Face[]>();

  faces?.forEach((face) => {
    const bucket = facesByUser.get(face.user_id);
    if (bucket) {
      bucket.push(face);
    } else {
      facesByUser.set(face.user_id, [face]);
    }
  });

  const usersWithFaces = (users ?? []).map((user) => ({
    ...user,
    faces: facesByUser.get(user.id) ?? [],
  }));
  const usersWithSamples = usersWithFaces.filter(
    (user) => user.faces.length > 0
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 sm:px-10">
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
            <p className="text-sm text-muted-foreground">Face samples stored</p>
            <p className="mt-2 text-3xl font-semibold">{totalFaceSamples}</p>
          </div>
        </div>
      </section>
      <section className="mt-10 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
        </header>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Matched user</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visits?.length ? (
                visits.map((visit) => {
                  const user = users?.find(
                    (candidate) => candidate.id === visit.matched_user_id
                  );

                  return (
                    <tr key={visit.id}>
                      <td className="px-4 py-3 font-medium capitalize">
                        {visit.status}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(visit.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user?.name ?? "Unknown"}
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
      </section>
      <section className="mt-10 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">User roster</h2>
          <p className="text-sm text-muted-foreground">
            Latest registered users listed first.
          </p>
        </header>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Face samples</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usersWithFaces.length ? (
                usersWithFaces.map((user) => (
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-muted-foreground"
                    colSpan={5}>
                    No users registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-10 space-y-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Face library</h2>
          <p className="text-sm text-muted-foreground">
            Preview the latest reference images captured per user.
          </p>
        </header>
        {usersWithSamples.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {usersWithSamples.map((user) => (
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
                  <span className="rounded-full border border-border px-3 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {user.role}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {user.faces.slice(0, 3).map((face) => (
                    <div
                      key={face.id}
                      className="relative h-24 overflow-hidden rounded-xl border border-border/60 bg-muted">
                      <Image
                        src={face.image_url}
                        alt={`Face sample of ${user.name ?? "user"}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 180px"
                      />
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
  );
};

const DashboardPage = async () => {
  const { profile } = await requireAdmin();

  return (
    <main className="space-y-10">
      <header className="mx-auto w-full max-w-6xl px-6 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{profile.name ? `, ${profile.name}` : ""}. Monitor usage,
          review visits, and manage your roster.
        </p>
      </header>
      {await DashboardSummary()}
    </main>
  );
};

export default DashboardPage;
