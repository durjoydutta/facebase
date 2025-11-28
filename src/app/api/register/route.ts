import { NextResponse, type NextRequest } from "next/server";

import {
  getSupabaseAdminClient,
  type SupabaseAdminClient,
} from "@/lib/supabaseClient";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

interface SamplePayload {
  image: string;
  embedding: number[];
}

const FACES_BUCKET = "faces";

const ensureFacesBucket = async (adminClient: SupabaseAdminClient) => {
  const { data: bucket, error: getError } = await adminClient.storage.getBucket(
    FACES_BUCKET
  );

  if (bucket || !getError) {
    return { error: null };
  }

  if (getError?.message && !getError.message.includes("not found")) {
    return { error: getError };
  }

  const { error: createError } = await adminClient.storage.createBucket(
    FACES_BUCKET,
    {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg"],
    }
  );

  return { error: createError };
};

const findAuthUserByEmail = async (
  adminClient: SupabaseAdminClient,
  email: string
) => {
  const normalized = email.toLowerCase();
  const perPage = 200;
  let page = 1;

  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return { user: null, error };
    }

    const match = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalized
    );

    if (match) {
      return { user: match, error: null };
    }

    if (data.users.length < perPage) {
      return { user: null, error: null };
    }

    page += 1;
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

export async function POST(request: NextRequest) {
  try {
    const supabaseServer = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = getSupabaseAdminClient();

    const { data: adminProfile, error: adminProfileError } = await adminClient
      .from("users")
      .select("id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (adminProfileError) {
      return NextResponse.json(
        { error: "Unable to resolve admin profile" },
        { status: 500 }
      );
    }

    if (adminProfile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: bucketError } = await ensureFacesBucket(adminClient);

    if (bucketError) {
      return NextResponse.json(
        {
          error: bucketError.message ?? "Unable to initialize storage bucket.",
        },
        { status: 500 }
      );
    }

    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      samples?: SamplePayload[];
    };

    const name = payload.name?.trim();
    const email = payload.email?.trim().toLowerCase();
    const samples = Array.isArray(payload.samples) ? payload.samples : [];

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required." },
        { status: 400 }
      );
    }

    if (samples.length === 0) {
      return NextResponse.json(
        { error: "At least one new face sample is required." },
        { status: 400 }
      );
    }

    const { data: existingProfile, error: profileError } = await adminClient
      .from("users")
      .select("id, auth_user_id, role")
      .eq("email", email)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    let authUserId = existingProfile?.auth_user_id ?? null;

    if (!authUserId) {
      const { user: existingAuthUser, error: lookupError } =
        await findAuthUserByEmail(adminClient, email);

      if (lookupError) {
        return NextResponse.json(
          {
            error:
              lookupError.message ?? "Unable to check existing credentials.",
          },
          { status: 500 }
        );
      }

      authUserId = existingAuthUser?.id ?? null;
    }

    if (!authUserId) {
      const password = randomUUID();
      const { data: createdUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name,
          },
        });

      if (createError || !createdUser.user) {
        return NextResponse.json(
          {
            error:
              createError?.message ??
              "Unable to create Supabase auth user. The email may already be registered.",
          },
          { status: createError?.status ?? 500 }
        );
      }

      authUserId = createdUser.user.id;
    } else {
      await adminClient.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          name,
        },
      });
    }

    const { data: userRecord, error: upsertError } = await adminClient
      .from("users")
      .upsert(
        {
          id: existingProfile?.id,
          auth_user_id: authUserId,
          email,
          name,
          role: existingProfile?.role ?? "member",
        },
        { onConflict: "auth_user_id" }
      )
      .select("id")
      .single();

    if (upsertError || !userRecord) {
      return NextResponse.json(
        { error: upsertError?.message ?? "Unable to upsert user profile." },
        { status: 500 }
      );
    }



    const faceRows = [] as {
      user_id: string;
      embedding: number[];
      image_url: string;
    }[];

    for (const [index, sample] of samples.entries()) {
      if (!Array.isArray(sample.embedding) || !sample.embedding.length) {
        continue;
      }

      const { buffer, contentType } = decodeBase64(sample.image);
      const path = `${userRecord.id}/${Date.now()}-${index}.png`;

      const upload = await adminClient.storage
        .from(FACES_BUCKET)
        .upload(path, buffer, {
          contentType,
          upsert: false,
        });

      if (upload.error) {
        return NextResponse.json(
          { error: upload.error.message },
          { status: 500 }
        );
      }

      const {
        data: { publicUrl },
      } = adminClient.storage.from(FACES_BUCKET).getPublicUrl(path);

      faceRows.push({
        user_id: userRecord.id,
        embedding: sample.embedding,
        image_url: publicUrl,
      });
    }

    if (faceRows.length === 0) {
      return NextResponse.json(
        { error: "No valid face samples were processed." },
        { status: 400 }
      );
    }

    const { error: insertError } = await adminClient
      .from("faces")
      .insert(faceRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while registering user.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
