import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

interface EndTradingBody {
  participantId: string;
  reconnectToken: string;
}

// Host-only: closes the trade window early (design doc "Trade Hub" -- "Host
// can end it early with a button on this page"). Only blocks NEW trade
// proposals from that point on; any trade already pending can still be
// accepted/declined via respond/route.ts.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/end-trading">
) {
  const { roomCode } = await ctx.params;

  let body: EndTradingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.participantId || !body.reconnectToken) {
    return NextResponse.json(
      { error: "participantId and reconnectToken are required" },
      { status: 400 }
    );
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, status")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game found with that room code" }, { status: 404 });
  }
  if (game.status !== "complete") {
    return NextResponse.json({ error: "Trading isn't open for this game" }, { status: 400 });
  }

  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .select("id, game_id, is_host, reconnect_token")
    .eq("id", body.participantId)
    .maybeSingle();

  if (participantError) {
    return NextResponse.json({ error: participantError.message }, { status: 500 });
  }
  if (
    !participant ||
    participant.game_id !== game.id ||
    participant.reconnect_token !== body.reconnectToken
  ) {
    return NextResponse.json({ error: "Not authorized in this game" }, { status: 403 });
  }
  if (!participant.is_host) {
    return NextResponse.json(
      { error: "Only the host can end trading early" },
      { status: 403 }
    );
  }

  const { error: endError } = await supabaseAdmin
    .from("games")
    .update({ trading_ended_early: true })
    .eq("id", game.id);
  if (endError) {
    return NextResponse.json({ error: endError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
