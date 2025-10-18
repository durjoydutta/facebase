import { NextResponse, type NextRequest } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";
import { AccessControlService } from "@/lib/accessControl";
import type { VisitStatus } from "@/lib/database.types";

interface ManualDecisionPayload {
  status?: VisitStatus;
  matchedUserId?: string | null;
  matchedUserName?: string | null;
  matchedUserEmail?: string | null;
  snapshotUrl?: string | null;
  distance?: number | null;
  banned?: boolean;
}

const isVisitStatus = (value: unknown): value is VisitStatus =>
  value === "accepted" || value === "rejected";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  let payload: ManualDecisionPayload;

  try {
    payload = (await request.json()) as ManualDecisionPayload;
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  if (!isVisitStatus(payload.status)) {
    return NextResponse.json(
      { error: "Status must be accepted or rejected." },
      { status: 400 }
    );
  }

  const result = await AccessControlService.notify({
    status: payload.status,
    matchedUserId: payload.matchedUserId ?? null,
    matchedUserName: payload.matchedUserName ?? null,
    matchedUserEmail: payload.matchedUserEmail ?? null,
    snapshotUrl: payload.snapshotUrl ?? null,
    distance: payload.distance ?? null,
    banned: payload.banned ?? false,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error ?? "Unable to dispatch access decision.",
        status: result.status ?? 500,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, status: result.status ?? 200 });
}

export async function GET() {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  return NextResponse.json({
    configured: AccessControlService.isConfigured(),
  });
}
