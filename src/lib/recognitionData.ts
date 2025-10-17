import type { SupabaseAdminClient } from "@/lib/supabaseClient";

export interface RecognitionFaceRow {
  id: string;
  user_id: string;
  embedding: number[];
  image_url: string;
  created_at: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    is_banned: boolean;
  } | null;
}

export const fetchRecognitionEmbeddings = async (
  supabase: SupabaseAdminClient
): Promise<RecognitionFaceRow[]> => {
  const { data, error } = await supabase
    .from("faces")
    .select(
      "id, user_id, embedding, image_url, created_at, user:users(id, name, email, is_banned)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Unable to fetch recognition embeddings");
  }

  const rows = data ?? [];

  return rows.flatMap((row) => {
    const embedding = Array.isArray(row.embedding) ? row.embedding : null;

    if (!embedding) {
      return [];
    }

    const user = row.user && typeof row.user === "object" ? row.user : null;

    return [
      {
        id: row.id,
        user_id: row.user_id,
        embedding: embedding.map(Number),
        image_url: row.image_url,
        created_at: row.created_at,
        user: user
          ? {
              id:
                "id" in user && typeof user.id === "string"
                  ? user.id
                  : row.user_id,
              name:
                "name" in user && typeof user.name !== "undefined"
                  ? (user.name as string | null)
                  : null,
              email:
                "email" in user && typeof user.email === "string"
                  ? user.email
                  : "",
              is_banned:
                "is_banned" in user && typeof user.is_banned === "boolean"
                  ? user.is_banned
                  : false,
            }
          : null,
      },
    ];
  });
};
