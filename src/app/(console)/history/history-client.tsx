"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Trash2,
  X,
} from "lucide-react";

import type { VisitStatus } from "@/lib/database.types";
import { ImageModal } from "@/components/ImageModal";
import { LoadingOverlay } from "@/components/LoadingOverlay";

interface HistoryClientProps {
  initialVisits: any[];
  initialTotal: number;
}

interface VisitsResponse {
  visits: {
    id: string;
    timestamp: string;
    status: VisitStatus;
    image_url: string | null;
    matched_user: {
      id: string;
      name: string | null;
      email: string;
    } | null;
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

const HistoryClient = ({ initialVisits, initialTotal }: HistoryClientProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL params
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") ?? "1", 10)
  );
  const [status, setStatus] = useState<VisitStatus | "">(
    (searchParams.get("status") as VisitStatus) || ""
  );
  const [dateFrom, setDateFrom] = useState(searchParams.get("from") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("to") ?? "");

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);

  const limit = 20;

  // Construct API URL
  const apiUrl = `/api/visits?page=${page}&limit=${limit}${
    status ? `&status=${status}` : ""
  }${dateFrom ? `&from=${dateFrom}` : ""}${dateTo ? `&to=${dateTo}` : ""}`;

  const {
    data,
    error,
    isLoading: isLoadingVisits,
    mutate,
  } = useSWR<VisitsResponse>(apiUrl, fetcher, {
    fallbackData:
      page === 1 && !status && !dateFrom && !dateTo
        ? {
            visits: initialVisits,
            total: initialTotal,
            page: 1,
            limit,
            totalPages: Math.ceil(initialTotal / limit),
          }
        : undefined,
    keepPreviousData: true,
  });

  const visits = data?.visits ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalRecords = data?.total ?? 0;

  const handleFilterChange = (key: string, value: string) => {
    setPage(1); // Reset to page 1 on filter change
    if (key === "status") setStatus(value as VisitStatus | "");
    if (key === "from") setDateFrom(value);
    if (key === "to") setDateTo(value);
  };

  const clearFilters = () => {
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;

    setIsDeleting(id);
    setLoadingText("Deleting record...");
    try {
      const res = await fetch(`/api/visits/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await mutate(); // Refresh data
    } catch (err) {
      console.error(err);
      alert("Failed to delete record");
    } finally {
      setIsDeleting(null);
      setLoadingText(null);
    }
  };


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
      await mutate();
    } catch (err) {
      console.error(err);
      alert("Failed to delete records");
    } finally {
      setIsDeleting(null);
      setLoadingText(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 pb-10 sm:px-10 relative">
      <LoadingOverlay isLoading={!!loadingText} message={loadingText || ""} fullScreen />
      <ImageModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage ?? ""}
      />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Visit History</h1>
          <p className="text-sm text-muted-foreground">
            Review and manage access logs.
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
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
              type="date"
              value={dateFrom}
              onChange={(e) => handleFilterChange("from", e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="to">
              To
            </label>
            <input
              id="to"
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange("to", e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={clearFilters}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent hover:text-accent-foreground">
              <X className="h-4 w-4" />
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
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
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Matched User</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
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
                        <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-border">
                          <Image
                            src={visit.image_url}
                            alt="Snapshot"
                            fill
                            className="cursor-pointer object-cover transition hover:scale-105"
                            onClick={() => setSelectedImage(visit.image_url)}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No snapshot
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
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
                    <td className="px-4 py-3">
                      {visit.matched_user ? (
                        <div>
                          <div className="font-medium text-foreground">
                            {visit.matched_user.name ?? "Unnamed"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {visit.matched_user.email}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(visit.id)}
                        disabled={isDeleting === visit.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        title="Delete record">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-muted-foreground"
                    colSpan={6}>
                    {isLoadingVisits
                      ? "Loading records..."
                      : "No visits found matching your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Showing {(page - 1) * limit + 1} to{" "}
            {Math.min(page * limit, totalRecords)} of {totalRecords} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoadingVisits}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50">
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || isLoadingVisits}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:bg-accent disabled:opacity-50">
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

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

export default HistoryClient;
