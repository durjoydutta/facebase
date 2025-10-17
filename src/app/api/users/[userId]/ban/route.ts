import { NextResponse, type NextRequest } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";

interface BanPayload {
  isBanned?: boolean;
}

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

export const dynamic = "force-dynamic";

export async function PATCH(
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

  let payload: BanPayload;

  try {
    payload = (await request.json()) as BanPayload;
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  if (!isBoolean(payload.isBanned)) {
    return NextResponse.json(
      { error: "Payload must include an isBanned boolean." },
      { status: 400 }
    );
  }

  const { userId } = await context.params;

  if (!userId) {
    return NextResponse.json(
      { error: "Missing user identifier." },
      { status: 400 }
    );
  }

  const { data: targetUser, error: fetchError } = await session.adminClient
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!targetUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (targetUser.role === "admin") {
    return NextResponse.json(
      { error: "Admins cannot be banned." },
      { status: 400 }
    );
  }

  const { error: updateError } = await session.adminClient
    .from("users")
    .update({ is_banned: payload.isBanned })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Unable to update ban state." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, isBanned: payload.isBanned });
}
