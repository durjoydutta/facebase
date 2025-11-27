import { NextResponse, type NextRequest } from "next/server";
import { Buffer } from "node:buffer";

import { resolveAdminSession } from "@/lib/adminSession";
import {
  fetchRecognitionEmbeddings,
  type RecognitionFaceRow,
} from "@/lib/recognitionData";
import type { VisitStatus } from "@/lib/database.types";
import type { SupabaseAdminClient } from "@/lib/supabaseClient";


const VISIT_BUCKET = "visit-snapshots";

const ensureVisitBucket = async (client: SupabaseAdminClient) => {
  const { data: bucket, error } = await client.storage.getBucket(VISIT_BUCKET);

  if (bucket || !error) {
    return;
  }

  if (!error.message?.includes("not found")) {
    throw error;
  }

  const { error: createError } = await client.storage.createBucket(
    VISIT_BUCKET,
    {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg"],
    }
  );

  if (createError) {
    throw createError;
  }
};

const decodeBase64 = (
  dataUrl: string
): { buffer: Buffer; contentType: string } => {
  const matches = dataUrl.match(/^data:(?<type>[^;]+);base64,(?<data>.+)$/);

  if (!matches?.groups?.type || !matches?.groups?.data) {
    throw new Error("Invalid image payload provided.");
  }

  const buffer = Buffer.from(matches.groups.data, "base64");
  return { buffer, contentType: matches.groups.type };
};

const isVisitStatus = (value: unknown): value is VisitStatus =>
  value === "accepted" || value === "rejected";

interface RecognitionLogPayload {
  status?: VisitStatus;
  matchedUserId?: string | null;
  image?: string;
}

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
    const faces: RecognitionFaceRow[] = await fetchRecognitionEmbeddings(
      session.adminClient
    );

    return NextResponse.json({ faces });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load recognition embeddings";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await resolveAdminSession();

  if (!session.ok) {
    return NextResponse.json(
      { error: session.message },
      { status: session.status }
    );
  }

  let payload: RecognitionLogPayload;

  try {
    payload = (await request.json()) as RecognitionLogPayload;
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  if (!isVisitStatus(payload.status)) {
    return NextResponse.json(
      { error: "Visit status must be either accepted or rejected." },
      { status: 400 }
    );
  }

  if (!payload.image) {
    return NextResponse.json(
      { error: "Snapshot image is required." },
      { status: 400 }
    );
  }

  if (payload.status === "accepted" && !payload.matchedUserId) {
    return NextResponse.json(
      { error: "Accepted visits must include a matched user." },
      { status: 400 }
    );
  }

  const adminClient = session.adminClient;

  try {
    await ensureVisitBucket(adminClient);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to initialize visit bucket";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let buffer: Buffer;
  let contentType: string;

  try {
    const result = decodeBase64(payload.image);
    buffer = result.buffer;
    contentType = result.contentType;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to decode snapshot.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const path = `${payload.matchedUserId ?? "unknown"}/${Date.now()}.png`;

  const upload = await adminClient.storage
    .from(VISIT_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (upload.error) {
    return NextResponse.json(
      { error: upload.error.message ?? "Unable to upload snapshot." },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = adminClient.storage.from(VISIT_BUCKET).getPublicUrl(path);

  let matchedUser: {
    id: string;
    name: string | null;
    email: string;
    is_banned: boolean;
  } | null = null;

  if (payload.matchedUserId) {
    const { data: userRecord } = await adminClient
      .from("users")
      .select("id, name, email, is_banned")
      .eq("id", payload.matchedUserId)
      .maybeSingle();

    matchedUser = userRecord ?? null;
  }

  const { data: visit, error: insertError } = await adminClient
    .from("visits")
    .insert({
      status: payload.status,
      matched_user_id: payload.matchedUserId ?? null,
      image_url: publicUrl,
    })
    .select("id, timestamp, status, matched_user_id, image_url")
    .single();

  if (insertError || !visit) {
    return NextResponse.json(
      { error: insertError?.message ?? "Unable to log visit." },
      { status: 500 }
    );
  }



  return NextResponse.json({ visit });
}
