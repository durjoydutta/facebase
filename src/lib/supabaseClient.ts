import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const getEnv = (key: string, fallbacks: string[] = []): string => {
  const attempts = [key, ...fallbacks];

  for (const attempt of attempts) {
    const value = process.env[attempt];

    if (value) {
      return value;
    }
  }

  throw new Error(`Missing environment variable: ${key}`);
};

const supabaseProjectUrl = getEnv("SUPABASE_PROJECT_URL", [
  "NEXT_PUBLIC_SUPABASE_URL",
]);
const supabaseServiceKey = getEnv("SUPABASE_SECRET_KEY", [
  "SUPABASE_SERVICE_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_KEY",
  "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
]);

let cachedClient: SupabaseClient<Database> | undefined;

export const getSupabaseAdminClient = (): SupabaseClient<Database> => {
  if (!cachedClient) {
    cachedClient = createClient<Database>(
      supabaseProjectUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return cachedClient;
};

export type SupabaseAdminClient = SupabaseClient<Database>;
