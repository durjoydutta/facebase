import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

const getEnv = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
};

const supabaseProjectUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = getEnv("NEXT_PUBLIC_SUPABASE_SERVICE_KEY");

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
