import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Server-side connectivity check, using the service_role key (bypasses RLS).
// Hitting this route proves: env vars are set in this deployment, the
// service role key is valid, and the players table has been seeded.
export async function GET() {
  const { count, error } = await supabaseAdmin
    .from("players")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, playerCount: count ?? 0 });
}
