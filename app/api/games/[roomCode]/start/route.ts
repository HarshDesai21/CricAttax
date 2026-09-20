import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

interface StartBody {
  participantId: string;
  reconnectToken: string;
}

// Host-only: flips a game from 'lobby' to 'drafting' once every seat is
// filled. There's no auth system, so "are you allowed to do this" is proven
// by presenting the participantId + reconnectToken pair that was handed
// back at create time -- the same pattern every write in this app uses
// instead of a session/cookie.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/start">
) {
  const { roomCode } = await ctx.params;

  let body: StartBody;
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
    .select("id, num_players, status")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game found with that room code" }, { status: 404 });
  }

  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .select("id, is_host, game_id, reconnect_token")
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
    return NextResponse.json({ error: "Not authorized to start this game" }, { status: 403 });
  }
  if (!participant.is_host) {
    return NextResponse.json(
      { error: "Only the host can start the draft" },
      { status: 403 }
    );
  }
  if (game.status !== "lobby") {
    return NextResponse.json({ error: "This game already started" }, { status: 400 });
  }

  const { count, error: countError } = await supabaseAdmin
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("game_id", game.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if ((count ?? 0) < game.num_players) {
    return NextResponse.json(
      { error: `Waiting for ${game.num_players - (count ?? 0)} more player(s) to join` },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("games")
    .update({ status: "drafting" })
    .eq("id", game.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
