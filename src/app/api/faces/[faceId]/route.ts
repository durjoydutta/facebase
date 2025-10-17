import { NextResponse, type NextRequest } from "next/server";

import { resolveAdminSession } from "@/lib/adminSession";

const FACES_BUCKET = "faces";

const extractStoragePath = (publicUrl: string): string | null => {
  const marker = `/storage/v1/object/public/${FACES_BUCKET}/`;
  const index = publicUrl.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return publicUrl.slice(index + marker.length);
};

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ faceId: string }> }
) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  const supabase = session.adminClient;
  const { faceId } = await context.params;

  if (!faceId) {
    return NextResponse.json(
      { error: "Missing face identifier" },
      { status: 400 }
    );
  }

  const { data: face, error: faceError } = await supabase
    .from("faces")
    .select("id, image_url")
    .eq("id", faceId)
    .maybeSingle();

  if (faceError) {
    return NextResponse.json({ error: faceError.message }, { status: 500 });
  }

  if (!face) {
    return NextResponse.json(
      { error: "Face sample not found" },
      { status: 404 }
    );
  }

  const storagePath = extractStoragePath(face.image_url);

  if (storagePath) {
    const { error: removeError } = await supabase.storage
      .from(FACES_BUCKET)
      .remove([storagePath]);

    if (removeError) {
      return NextResponse.json(
        {
          error:
            removeError.message ?? "Unable to remove face image from storage",
        },
        { status: 500 }
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("faces")
    .delete()
    .eq("id", faceId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
