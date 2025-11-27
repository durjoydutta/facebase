import { NextResponse, type NextRequest } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";
import type { VisitStatus } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const parseStatus = (raw?: string | null): VisitStatus | undefined => {
  if (raw === "accepted" || raw === "rejected") {
    return raw;
  }
  return undefined;
};

export async function GET(request: NextRequest) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const status = parseStatus(searchParams.get("status"));
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  const supabase = session.adminClient;
  let query = supabase
    .from("visits")
    .select("id, timestamp, status, image_url, matched_user_id", {
      count: "exact",
    })
    .order("timestamp", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  if (from) {
    // Append time to make it inclusive if it's just a date, or assume ISO
    // If it's YYYY-MM-DD, we might want to ensure it covers the day.
    // But usually 'from' is start of day.
    query = query.gte("timestamp", from);
  }

  if (to) {
    // If 'to' is YYYY-MM-DD, we probably want end of that day.
    // But for simplicity, let's assume the client sends appropriate ISO or date strings.
    // If client sends YYYY-MM-DD, Supabase compares as timestamp.
    // Let's just pass it through for now.
    query = query.lte("timestamp", to);
  }

  const rangeFrom = (page - 1) * limit;
  const rangeTo = rangeFrom + limit - 1;

  const { data: visits, error, count } = await query.range(rangeFrom, rangeTo);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch user details for matched visits
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

  const enrichedVisits = (visits ?? []).map((visit) => ({
    ...visit,
    matched_user: visit.matched_user_id
      ? userLookup.get(visit.matched_user_id) ?? null
      : null,
  }));

  return NextResponse.json({
    visits: enrichedVisits,
    total: count ?? 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  });
}

export async function DELETE(request: NextRequest) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "No IDs provided for deletion." },
        { status: 400 }
      );
    }

    const supabase = session.adminClient;

    // Optional: Delete images from storage if needed.
    // For now, we'll just delete the records.

    const { error } = await supabase.from("visits").delete().in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: ids.length });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }
}
