import { NextResponse } from "next/server";
import { resolveAdminSession } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  const { data: users, error } = await session.adminClient
    .from("users")
    .select("id, name, email, faces(count)")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users });
}
