import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Uses the service_role key, which BYPASSES Row
// Level Security entirely. This must only ever be imported from Route
// Handlers (app/api/**/route.ts) or other server-side code -- never from a
// "use client" component or anything that ends up in the browser bundle.
//
// The `import "server-only"` above makes Next.js throw a build error if this
// file is ever accidentally imported into client code.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in your Supabase project's values."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    // This client never has a signed-in user -- it authenticates as the
    // service role itself, so there's no session to persist.
    persistSession: false,
  },
});
