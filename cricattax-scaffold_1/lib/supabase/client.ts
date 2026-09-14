"use client";

import { createClient } from "@supabase/supabase-js";

// Browser-side Supabase client. Uses the `anon` public key, which is safe to
// ship to the client -- Row Level Security (see supabase/schema.sql) is what
// actually restricts what this key can read and write.
//
// Never import lib/supabase/server.ts from client code -- that file holds the
// service_role key, which bypasses RLS entirely.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project's values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
