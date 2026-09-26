import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_XI_SIZE = 11;
const MAX_OVERSEAS_IN_XI = 4;

interface PlayingXiBody {
  participantId: string;
  reconnectToken: string;
  xi: number[]; // player ids, in order -- position in this array = jersey number - 1
  subs: number[]; // player ids, in order
}

// Saves a participant's own Playing XI arrangement (see design doc "Playing
// XI + Trading (iteration 3)", pulled forward into this mini-iteration
// ahead of Trading). Always a full replace of that participant's
// playing_xi rows -- simpler and safer than trying to diff a drag-and-drop
// reorder against whatever was there before, and cheap at this scale (at
// most 25 rows per participant).
//
// Trading isn't built yet, so for now the only players a participant can
// ever arrange are the ones they actually drafted -- validated below
// against round_cards, not just trusted from the request body.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/playing-xi">
) {
  const { roomCode } = await ctx.params;

  let body: PlayingXiBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.participantId ||
    !body.reconnectToken ||
    !Array.isArray(body.xi) ||
    !Array.isArray(body.subs) ||
    !body.xi.every((id) => typeof id === "number") ||
    !body.subs.every((id) => typeof id === "number")
  ) {
    return NextResponse.json(
      { error: "participantId, reconnectToken, xi[], and subs[] are required" },
      { status: 400 }
    );
  }
  if (body.xi.length > MAX_XI_SIZE) {
    return NextResponse.json(
      { error: `Playing XI can have at most ${MAX_XI_SIZE} players` },
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
    return NextResponse.json(
      { error: "The Playing XI can only be set once the draft is complete" },
      { status: 400 }
    );
  }

  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .select("id, game_id, reconnect_token")
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

  // The participant's real drafted squad -- the only players this
  // arrangement is allowed to contain, until Trading exists.
  const { data: squadCards, error: squadError } = await supabaseAdmin
    .from("round_cards")
    .select("player_id")
    .eq("game_id", game.id)
    .eq("picked_by_participant_id", participant.id)
    .eq("status", "picked");

  if (squadError || !squadCards) {
    return NextResponse.json(
      { error: squadError?.message ?? "Could not load your squad" },
      { status: 500 }
    );
  }

  const squadPlayerIds = new Set(
    squadCards.map((c) => c.player_id).filter((id): id is number => id != null)
  );

  const submitted = [...body.xi, ...body.subs];
  const submittedSet = new Set(submitted);

  if (submitted.length !== submittedSet.size) {
    return NextResponse.json(
      { error: "A player appears more than once in the arrangement" },
      { status: 400 }
    );
  }
  if (
    submittedSet.size !== squadPlayerIds.size ||
    ![...submittedSet].every((id) => squadPlayerIds.has(id))
  ) {
    return NextResponse.json(
      { error: "The arrangement must include exactly your drafted squad -- nothing more, nothing less" },
      { status: 400 }
    );
  }

  const { data: playerRows, error: playersError } = await supabaseAdmin
    .from("players")
    .select("id, is_overseas")
    .in("id", body.xi);

  if (playersError || !playerRows) {
    return NextResponse.json(
      { error: playersError?.message ?? "Could not validate players" },
      { status: 500 }
    );
  }
  const overseasInXi = playerRows.filter((p) => p.is_overseas).length;
  if (overseasInXi > MAX_OVERSEAS_IN_XI) {
    return NextResponse.json(
      { error: `A Playing XI can have at most ${MAX_OVERSEAS_IN_XI} overseas players` },
      { status: 400 }
    );
  }

  const rows = [
    ...body.xi.map((player_id, position) => ({
      participant_id: participant.id,
      player_id,
      slot_type: "xi" as const,
      position,
    })),
    ...body.subs.map((player_id, position) => ({
      participant_id: participant.id,
      player_id,
      slot_type: "subs" as const,
      position,
    })),
  ];

  // Full replace: delete this participant's existing rows, then insert the
  // submitted arrangement. Not wrapped in a single DB transaction (Supabase's
  // JS client doesn't expose one for arbitrary multi-statement writes), but
  // safe in practice -- this endpoint is only ever called by the owning
  // participant's own browser, never concurrently with itself.
  const { error: deleteError } = await supabaseAdmin
    .from("playing_xi")
    .delete()
    .eq("participant_id", participant.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabaseAdmin.from("playing_xi").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
