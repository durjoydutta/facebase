import { NextResponse } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";
import { fetchDashboardData, type DashboardData } from "@/lib/dashboardData";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  try {
    const payload: DashboardData = await fetchDashboardData(
      session.adminClient
    );
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dashboard data";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
