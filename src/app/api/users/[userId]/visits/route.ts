import { NextResponse, type NextRequest } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  const { userId } = await context.params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  if (isNaN(page) || page < 1) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = session.adminClient;

  const { data: visits, error, count } = await supabase
    .from("visits")
    .select("id, timestamp, status, image_url", { count: "exact" })
    .eq("matched_user_id", userId)
    .order("timestamp", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    visits: visits ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: count ? Math.ceil(count / limit) : 0,
  });
}
