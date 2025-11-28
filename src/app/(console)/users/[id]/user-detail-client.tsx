"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";

import { ImageModal } from "@/components/ImageModal";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import type { Database, VisitStatus } from "@/lib/database.types";

// --- Attendance Calendar Component ---

const AttendanceCalendar = ({ userId }: { userId: string }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const { data, isLoading } = useSWR<{ timestamps: string[] }>(
    `/api/users/${userId}/attendance?year=${year}&month=${month}`,
    fetcher
  );

  const visitedDays = useMemo(() => {
    const days = new Set<number>();
    if (data?.timestamps) {
      data.timestamps.forEach((ts) => {
        const date = new Date(ts);
        days.add(date.getDate());
      });
    }
    return days;
  }, [data]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const monthName = currentDate.toLocaleString("default", { month: "long" });

  const renderCalendarDays = () => {
    const days = [];
    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-10 w-10" />);
    }

    // Days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const isVisited = visitedDays.has(d);
      const isToday =
        d === new Date().getDate() &&
        month === new Date().getMonth() + 1 &&
        year === new Date().getFullYear();

      days.push(
        <div
          key={d}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors ${
            isVisited
              ? "bg-emerald-500 text-white shadow-sm"
              : isToday
              ? "border border-primary text-primary"
              : "text-foreground hover:bg-muted"
          }`}
          title={isVisited ? "Visited" : undefined}
        >
          {d}
        </div>
      );
    }
    return days;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Attendance</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-border p-1 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[100px] text-center text-sm font-medium">
            {monthName} {year}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-lg border border-border p-1 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div
            key={day}
            className="flex h-10 w-10 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {renderCalendarDays()}
      </div>
      
      {isLoading && (
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Loading attendance data...
        </div>
      )}
      
      <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <span>Present</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full border border-primary" />
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};



type UserRow = Database["public"]["Tables"]["users"]["Row"];

interface UserDetailClientProps {
  user: UserRow;
  initialFaces: {
    id: string;
    image_url: string;
    created_at: string;
  }[];
  initialVisits: {
    id: string;
    timestamp: string;
    status: VisitStatus;
    image_url: string | null;
  }[];
}

interface VisitsResponse {
  visits: {
    id: string;
    timestamp: string;
    status: VisitStatus;
    image_url: string | null;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const UserDetailClient = ({
  user,
  initialFaces,
  initialVisits,
}: UserDetailClientProps) => {
  const router = useRouter();
  const [isBanned, setIsBanned] = useState(user.is_banned);
  const [faces, setFaces] = useState(initialFaces);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: visitsData, isLoading: isLoadingVisits } = useSWR<VisitsResponse>(
    `/api/users/${user.id}/visits?page=${page}&limit=${limit}`,
    fetcher,
    {
      fallbackData:
        page === 1
          ? {
              visits: initialVisits,
              total: 0, // We don't know total initially from props, but SWR will fetch it
              page: 1,
              limit,
              totalPages: 1,
            }
          : undefined,
      keepPreviousData: true,
    }
  );

  const visits = visitsData?.visits ?? [];
  const totalPages = visitsData?.totalPages ?? 1;

  const handleToggleBan = async () => {
    setIsLoadingAction(true);
    setLoadingText(isBanned ? "Unbanning user..." : "Banning user...");
    try {
      const nextState = !isBanned;
      const response = await fetch(`/api/users/${user.id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanned: nextState }),
      });

      if (!response.ok) throw new Error("Failed to update ban status");
      setIsBanned(nextState);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to update ban status");
    } finally {
      setIsLoadingAction(false);
      setLoadingText(null);
    }
  };

  const handleDeleteUser = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this user? This action cannot be undone."
      )
    )
      return;

    setIsLoadingAction(true);
    setLoadingText("Deleting user...");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete user");
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      alert("Failed to delete user");
      setIsLoadingAction(false);
      setLoadingText(null);
    }
  };

  const handleDeleteFace = async (faceId: string) => {
    if (!confirm("Delete this face sample?")) return;

    try {
      setLoadingText("Deleting face sample...");
      const response = await fetch(`/api/faces/${faceId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete face");
      setFaces((prev) => prev.filter((f) => f.id !== faceId));
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to delete face sample");
    } finally {
      setLoadingText(null);
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user.name ?? "",
    email: user.email,
  });

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingAction(true);
    setLoadingText("Updating user details...");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) throw new Error("Failed to update user");
      
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to update user details");
    } finally {
      setIsLoadingAction(false);
      setLoadingText(null);
    }
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(visits.map((v) => v.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selectedIds.size} selected records?`
      )
    )
      return;

    setIsDeleting("bulk");
    setLoadingText("Deleting selected records...");
    try {
      const res = await fetch("/api/visits", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (!res.ok) throw new Error("Failed to delete records");
      
      setSelectedIds(new Set());
      // Re-fetch visits
      const updatedVisits = await fetcher(`/api/users/${user.id}/visits?page=${page}&limit=${limit}`);
      // Since we use SWR, we can just trigger a revalidation, but here we might need to manually mutate if we don't have the mutate function exposed easily or just rely on auto-revalidation.
      // Ideally we should use mutate from useSWR.
      // Let's just refresh the page for simplicity as per previous patterns, or better, use router.refresh()
      router.refresh();
      // Also mutate SWR cache if possible, but we need the key.
      // We can just reload the window or let SWR handle it on focus.
      // For now, router.refresh() is good.
    } catch (err) {
      console.error(err);
      alert("Failed to delete records");
    } finally {
      setIsDeleting(null);
      setLoadingText(null);
    }
  };

  return (
    <main className="space-y-8 pb-10 relative">
      <LoadingOverlay isLoading={!!loadingText} message={loadingText || ""} fullScreen />
      {/* ... (existing modals) ... */}
      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage ?? ""}
      />

      {/* Edit User Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="text-xl font-semibold">Edit User Details</h2>
            <form onSubmit={handleUpdateUser} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="User Name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoadingAction}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50">
                  {isLoadingAction ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="mx-auto w-full max-w-5xl px-6 sm:px-8">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-10 w-10" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">
                  {user.name ?? "Unnamed User"}
                </h1>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs font-medium text-primary hover:underline">
                  Edit
                </button>
              </div>
              <p className="text-muted-foreground">{user.email}</p>
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {user.role}
                </span>
                <span className="text-muted-foreground">
                  Joined {formatDate(user.created_at)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleBan}
              disabled={isLoadingAction}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                isBanned
                  ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                  : "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
              }`}>
              {isBanned ? (
                <>
                  <Shield className="h-4 w-4" /> Unban User
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4" /> Ban User
                </>
              )}
            </button>
            <button
              onClick={handleDeleteUser}
              disabled={isLoadingAction}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 sm:px-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Face Library</h2>
            {faces.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {faces.map((face) => (
                  <div
                    key={face.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                    <Image
                      src={face.image_url}
                      alt="Face sample"
                      fill
                      className="cursor-pointer object-cover transition hover:scale-105"
                      onClick={() => setSelectedImage(face.image_url)}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFace(face.id);
                      }}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No face samples found.
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Visit History</h2>
              {visitsData?.total ? (
                <span className="text-xs text-muted-foreground">
                  {visitsData.total} total visits
                </span>
              ) : null}
            </div>
            
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={
                            visits.length > 0 &&
                            visits.every((v) => selectedIds.has(v.id))
                          }
                          onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">Snapshot</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visits.length ? (
                      visits.map((visit) => (
                        <tr key={visit.id} className="group hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              checked={selectedIds.has(visit.id)}
                              onChange={(e) =>
                                handleSelectOne(visit.id, e.target.checked)
                              }
                            />
                          </td>
                          <td className="px-4 py-3">
                            {visit.image_url ? (
                              <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-border">
                                <Image
                                  src={visit.image_url}
                                  alt="Visit"
                                  fill
                                  className="cursor-pointer object-cover"
                                  onClick={() =>
                                    setSelectedImage(visit.image_url)
                                  }
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                No image
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 capitalize">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                visit.status === "accepted"
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : "bg-red-500/10 text-red-600"
                              }`}>
                              {visit.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(visit.timestamp)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-muted-foreground">
                          {isLoadingVisits
                            ? "Loading visits..."
                            : "No visits recorded."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 ? (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoadingVisits}
                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isLoadingVisits}
                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="font-semibold">User Stats</h3>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total Visits</dt>
                <dd className="font-medium">
                  {visitsData?.total ?? initialVisits.length}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last Seen</dt>
                <dd className="font-medium">
                  {visits[0] ? formatDate(visits[0].timestamp) : "Never"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Face Samples</dt>
                <dd className="font-medium">{faces.length}</dd>
              </div>
            </dl>
          </div>
          
          <AttendanceCalendar userId={user.id} />
        </div>
      </div>

      {/* Sticky Action Bar */}
      <div
        className={`fixed bottom-6 left-1/2 z-50 flex w-full max-w-2xl -translate-x-1/2 items-center justify-between rounded-full border border-border bg-background/80 px-6 py-3 shadow-xl backdrop-blur-md transition-all duration-300 ${
          selectedIds.size > 0
            ? "translate-y-0 opacity-100"
            : "translate-y-20 opacity-0 pointer-events-none"
        }`}>
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="text-sm font-bold">{selectedIds.size}</span>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            items selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={!!isDeleting}
            className="inline-flex items-center gap-2 rounded-full bg-destructive px-5 py-2 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90 disabled:opacity-50">
            {isDeleting === "bulk" ? (
              "Deleting..."
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
};

export default UserDetailClient;
