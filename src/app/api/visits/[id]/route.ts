import { NextResponse, type NextRequest } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";

const VISITS_BUCKET = "visits"; // Assuming visits images are in a 'visits' bucket if they exist.
// However, the current code doesn't explicitly mention where visit images are stored.
// dashboard-client.tsx doesn't show deletion of visits.
// recognize-client.tsx uploads to 'visits' bucket.
// So we should try to delete the image from storage too.

const extractStoragePath = (publicUrl: string): string | null => {
  const marker = `/storage/v1/object/public/${VISITS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return publicUrl.slice(index + marker.length);
};

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Missing visit identifier" },
      { status: 400 }
    );
  }

  const supabase = session.adminClient;

  const { data: visit, error: fetchError } = await supabase
    .from("visits")
    .select("id, image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // Try to delete image from storage if it exists
  if (visit.image_url) {
    const storagePath = extractStoragePath(visit.image_url);
    if (storagePath) {
      await supabase.storage.from(VISITS_BUCKET).remove([storagePath]);
      // We ignore storage errors here to ensure the record is deleted even if image is missing/stuck
    }
  }

  const { error: deleteError } = await supabase
    .from("visits")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message ?? "Unable to delete visit record" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
