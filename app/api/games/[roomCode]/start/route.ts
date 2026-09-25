import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildRoundAssignments, initialPickOrder } from "@/lib/draft";
import type { Player } from "@/lib/types";

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
    .select("id, num_players, num_rounds, status")
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

  const { data: seatedParticipants, error: seatedError } = await supabaseAdmin
    .from("participants")
    .select("id, seat_number")
    .eq("game_id", game.id);

  if (seatedError) {
    return NextResponse.json({ error: seatedError.message }, { status: 500 });
  }
  if ((seatedParticipants?.length ?? 0) < game.num_players) {
    return NextResponse.json(
      {
        error: `Waiting for ${
          game.num_players - (seatedParticipants?.length ?? 0)
        } more player(s) to join`,
      },
      { status: 400 }
    );
  }

  // Generate the ENTIRE draft's mystery cards right now, in one shot -- see
  // lib/draft.ts. This is the moment the reveal-weighting math runs; every
  // round after round 1 just reads cards that already exist as hidden rows.
  const { data: pool, error: poolError } = await supabaseAdmin
    .from("players")
    .select(
      "id, short_name, full_name, country, is_overseas, role, position, batting_avg, bowling_avg, tier, popular_name"
    );

  if (poolError || !pool) {
    return NextResponse.json(
      { error: poolError?.message ?? "Could not load the player pool" },
      { status: 500 }
    );
  }

  let assignments;
  try {
    assignments = buildRoundAssignments(pool as Player[], game.num_rounds, game.num_players);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the draft" },
      { status: 500 }
    );
  }

  const { data: insertedCards, error: cardsError } = await supabaseAdmin
    .from("round_cards")
    .insert(
      assignments.map((a) => ({
        game_id: game.id,
        round_number: a.round_number,
        slot_index: a.slot_index,
        // player_id and status are intentionally left at their defaults
        // (NULL / 'hidden') -- see the schema's masking-split comment.
      }))
    )
    .select("id, round_number, slot_index");

  if (cardsError || !insertedCards) {
    return NextResponse.json(
      { error: cardsError?.message ?? "Failed to generate round cards" },
      { status: 500 }
    );
  }

  // Match each inserted round_card back to its real player by (round,
  // slot) rather than by array order -- Postgres doesn't guarantee a
  // multi-row INSERT...RETURNING preserves input order, and this table has
  // a unique(game_id, round_number, slot_index) constraint that makes the
  // match unambiguous either way.
  const cardIdByRoundSlot = new Map(
    insertedCards.map((c) => [`${c.round_number}-${c.slot_index}`, c.id])
  );
  const assignmentRows = assignments.map((a) => ({
    round_card_id: cardIdByRoundSlot.get(`${a.round_number}-${a.slot_index}`)!,
    player_id: a.player_id,
  }));

  const { error: assignmentsError } = await supabaseAdmin
    .from("round_card_assignments")
    .insert(assignmentRows);

  if (assignmentsError) {
    // Roll back the round_cards we just inserted so a failed draft-start
    // doesn't leave the game stuck half-generated. round_card_assignments
    // has ON DELETE CASCADE from round_cards, so this alone is sufficient.
    await supabaseAdmin.from("round_cards").delete().eq("game_id", game.id);
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  const pickOrder = initialPickOrder(seatedParticipants ?? []);

  const { error: updateError } = await supabaseAdmin
    .from("games")
    .update({ status: "drafting", pick_order: pickOrder, current_round: 1 })
    .eq("id", game.id);

  if (updateError) {
    await supabaseAdmin.from("round_cards").delete().eq("game_id", game.id);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
