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
  ]);

  if (usersError || visitsError) {
    throw new Error(
      usersError?.message ??
        visitsError?.message ??
        "Unable to load dashboard data"
    );
  }

  const totalUsers = users?.length ?? 0;
  const statuses = visits?.reduce<Record<VisitStatus, number>>(
    (acc, visit) => {
      acc[visit.status] += 1;
      return acc;
    },
    { accepted: 0, rejected: 0 }
  ) ?? { accepted: 0, rejected: 0 };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 sm:px-10">
      <section>
        <h2 className="text-lg font-semibold">Overview</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Registered users</p>
            <p className="mt-2 text-3xl font-semibold">{totalUsers}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Visits accepted (7d)
            </p>
            <p className="mt-2 text-3xl font-semibold">{statuses.accepted}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Visits rejected (7d)
            </p>
            <p className="mt-2 text-3xl font-semibold">{statuses.rejected}</p>
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
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users?.length ? (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium">
                      {user.name ?? "Unnamed"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.email}
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
                    colSpan={4}>
                    No users registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
