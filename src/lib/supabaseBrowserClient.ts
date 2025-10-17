"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let cachedClient: SupabaseClient<Database> | undefined;

export const getSupabaseBrowserClient = (): SupabaseClient<Database> => {
  if (!cachedClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
    }

    if (!supabaseAnonKey) {
      throw new Error(
        "Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }

    cachedClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }

  return cachedClient;
};
