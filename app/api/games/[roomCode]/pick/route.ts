import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { activeParticipantId } from "@/lib/draft";

interface PickBody {
  participantId: string;
  reconnectToken: string;
  slotIndex: number;
}

// A participant claims one of the current round's face-down slots. Per the
// design doc: cards stay blind to everyone (including the picker) until the
// whole round is claimed, at which point every card in that round reveals
// at once. So this route only ever does one of two things: (1) record a
// claim on a still-hidden card, or (2) record that claim AND, if it was the
// last one needed this round, batch-reveal the round.
//
// Advancing to the NEXT round (rotating pick_order, bumping current_round,
// flipping status to 'complete') is deliberately NOT done here anymore --
// it's a separate host-only action, POST .../advance-round. Bundling both
// into one request used to race the client: the Realtime broadcast for the
// reveal and the broadcast for the round-advance could arrive close enough
// together that the board re-rendered showing the NEXT round's hidden cards
// before the player ever saw the reveal animation for the round they just
// finished. Splitting them means the round stays "complete but not yet
// advanced" for as long as the host wants, with every card visibly
// revealed, until the host explicitly clicks through.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/pick">
) {
  const { roomCode } = await ctx.params;

  let body: PickBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !body.participantId ||
    !body.reconnectToken ||
    typeof body.slotIndex !== "number" ||
    !Number.isInteger(body.slotIndex)
  ) {
    return NextResponse.json(
      { error: "participantId, reconnectToken, and an integer slotIndex are required" },
      { status: 400 }
    );
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, num_players, num_rounds, current_round, pick_order, status")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game found with that room code" }, { status: 404 });
  }
  if (game.status !== "drafting") {
    return NextResponse.json({ error: "This game isn't currently drafting" }, { status: 400 });
  }
  if (body.slotIndex < 0 || body.slotIndex >= game.num_players) {
    return NextResponse.json({ error: "slotIndex is out of range" }, { status: 400 });
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

  const { data: roundCards, error: roundCardsError } = await supabaseAdmin
    .from("round_cards")
    .select("id, slot_index, picked_by_participant_id")
    .eq("game_id", game.id)
    .eq("round_number", game.current_round)
    .order("slot_index", { ascending: true });

  if (roundCardsError || !roundCards) {
    return NextResponse.json(
      { error: roundCardsError?.message ?? "Could not load this round's cards" },
      { status: 500 }
    );
  }

  const pickOrder = (game.pick_order ?? []) as string[];
  const claimedCount = roundCards.filter((c) => c.picked_by_participant_id !== null).length;
  const active = activeParticipantId(pickOrder, claimedCount);

  if (active !== participant.id) {
    return NextResponse.json({ error: "It's not your turn" }, { status: 403 });
  }

  const targetCard = roundCards.find((c) => c.slot_index === body.slotIndex);
  if (!targetCard) {
    return NextResponse.json({ error: "That slot doesn't exist this round" }, { status: 400 });
  }
  if (targetCard.picked_by_participant_id !== null) {
    return NextResponse.json({ error: "That slot has already been taken" }, { status: 400 });
  }

  // Conditional update (only succeeds if still unclaimed) closes the race
  // where two requests for the same slot land at nearly the same instant --
  // whichever one the database applies first wins, the other gets 409.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("round_cards")
    .update({ picked_by_participant_id: participant.id, picked_at: new Date().toISOString() })
    .eq("id", targetCard.id)
    .is("picked_by_participant_id", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "Someone just claimed that slot -- try another" },
      { status: 409 }
    );
  }

  const newClaimedCount = claimedCount + 1;
  const roundComplete = newClaimedCount >= game.num_players;

  if (!roundComplete) {
    return NextResponse.json({ ok: true, roundComplete: false, gameComplete: false });
  }

  // Last pick of the round: reveal every card in this round at once. The
  // game stays in 'drafting' with current_round unchanged -- the board now
  // shows every slot revealed, and stays that way until the host calls
  // advance-round. Nothing here rotates pick_order or touches current_round.
  const roundCardIds = [...roundCards.map((c) => c.id), targetCard.id];
  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from("round_card_assignments")
    .select("round_card_id, player_id")
    .in("round_card_id", roundCardIds);

  if (assignmentsError || !assignments) {
    return NextResponse.json(
      { error: assignmentsError?.message ?? "Could not load this round's real cards" },
      { status: 500 }
    );
  }

  for (const assignment of assignments) {
    const { error: revealError } = await supabaseAdmin
      .from("round_cards")
      .update({ player_id: assignment.player_id, status: "picked" })
      .eq("id", assignment.round_card_id);
    if (revealError) {
      return NextResponse.json({ error: revealError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, roundComplete: true, gameComplete: false });
}
