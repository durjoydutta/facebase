import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { fetchRecognitionEmbeddings } from "@/lib/recognitionData";

import RecognizeClient from "./recognize-client";

export const dynamic = "force-dynamic";

const RecognizePage = async () => {
  const { profile } = await requireAdmin();
  const adminClient = getSupabaseAdminClient();
  const faces = await fetchRecognitionEmbeddings(adminClient);

  return (
    <RecognizeClient
      adminName={profile.name ?? profile.email}
      initialFaces={faces}
    />
  );
};

export default RecognizePage;
