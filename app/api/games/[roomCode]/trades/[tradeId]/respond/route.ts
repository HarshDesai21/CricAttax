import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

interface RespondBody {
  participantId: string;
  reconnectToken: string;
  accept: boolean;
}

// Accept or decline a pending trade -- only the TARGET participant (the one
// the trade was proposed to) may respond. Deliberately allowed even after
// the trade window itself has closed (see trades/route.ts, which blocks new
// PROPOSALS once it's closed) -- a trade already sitting in someone's inbox
// shouldn't get stranded just because the 30-minute clock ran out while
// they were deciding.
//
// On accept, this is the one place the actual squad swap happens:
//   1. Re-validate both players are still owned by the right side and
//      still un-locked (in case something changed since the trade was
//      proposed -- e.g. the offering side already spent that player in
//      another accepted trade).
//   2. Repoint both round_cards rows' picked_by_participant_id to the new
//      owner and set acquired_via_trade = true (permanently trade-locking
//      both players going forward).
//   3. If either side already has a saved Playing XI arrangement
//      containing the outgoing player, swap that row's player_id in place
//      -- the incoming player lands in the exact same slot_type/position
//      the outgoing one held, per the confirmed design. A side with no
//      saved arrangement yet just gets the default-seed on next view,
//      which already reads off the now-updated round_cards.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/trades/[tradeId]/respond">
) {
  const { roomCode, tradeId } = await ctx.params;

  let body: RespondBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.participantId || !body.reconnectToken || typeof body.accept !== "boolean") {
    return NextResponse.json(
      { error: "participantId, reconnectToken, and accept are required" },
      { status: 400 }
    );
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id")
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

  const { data: trade, error: tradeError } = await supabaseAdmin
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .eq("game_id", game.id)
    .maybeSingle();

  if (tradeError) {
    return NextResponse.json({ error: tradeError.message }, { status: 500 });
  }
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  if (trade.target_participant_id !== participant.id) {
    return NextResponse.json(
      { error: "Only the team this trade was proposed to can respond" },
      { status: 403 }
    );
  }
  if (trade.status !== "pending") {
    return NextResponse.json({ error: "This trade has already been resolved" }, { status: 400 });
  }

  if (!body.accept) {
    const { error: declineError } = await supabaseAdmin
      .from("trades")
      .update({ status: "declined", resolved_at: new Date().toISOString() })
      .eq("id", trade.id);
    if (declineError) {
      return NextResponse.json({ error: declineError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "declined" });
  }

  // Re-validate both sides right before committing the swap -- the trade
  // may have sat pending long enough for one of these players to have moved
  // via a different, faster-accepted trade in the meantime.
  const { data: offeredCard, error: offeredError } = await supabaseAdmin
    .from("round_cards")
    .select("id, acquired_via_trade")
    .eq("game_id", game.id)
    .eq("player_id", trade.offered_player_id)
    .eq("picked_by_participant_id", trade.proposer_participant_id)
    .eq("status", "picked")
    .maybeSingle();

  if (offeredError) {
    return NextResponse.json({ error: offeredError.message }, { status: 500 });
  }
  if (!offeredCard || offeredCard.acquired_via_trade) {
    return NextResponse.json(
      { error: "The offered player is no longer available for this trade" },
      { status: 409 }
    );
  }

  const { data: requestedCard, error: requestedError } = await supabaseAdmin
    .from("round_cards")
    .select("id, acquired_via_trade")
    .eq("game_id", game.id)
    .eq("player_id", trade.requested_player_id)
    .eq("picked_by_participant_id", trade.target_participant_id)
    .eq("status", "picked")
    .maybeSingle();

  if (requestedError) {
    return NextResponse.json({ error: requestedError.message }, { status: 500 });
  }
  if (!requestedCard || requestedCard.acquired_via_trade) {
    return NextResponse.json(
      { error: "The requested player is no longer available for this trade" },
      { status: 409 }
    );
  }

  const { error: swapOfferedError } = await supabaseAdmin
    .from("round_cards")
    .update({
      picked_by_participant_id: trade.target_participant_id,
      acquired_via_trade: true,
    })
    .eq("id", offeredCard.id);
  if (swapOfferedError) {
    return NextResponse.json({ error: swapOfferedError.message }, { status: 500 });
  }

  const { error: swapRequestedError } = await supabaseAdmin
    .from("round_cards")
    .update({
      picked_by_participant_id: trade.proposer_participant_id,
      acquired_via_trade: true,
    })
    .eq("id", requestedCard.id);
  if (swapRequestedError) {
    return NextResponse.json({ error: swapRequestedError.message }, { status: 500 });
  }

  // Auto-fill: if either side already saved a Playing XI containing the
  // player they're giving up, the incoming player takes that exact row
  // (same slot_type/position) rather than the row simply vanishing.
  await supabaseAdmin
    .from("playing_xi")
    .update({ player_id: trade.requested_player_id })
    .eq("participant_id", trade.proposer_participant_id)
    .eq("player_id", trade.offered_player_id);

  await supabaseAdmin
    .from("playing_xi")
    .update({ player_id: trade.offered_player_id })
    .eq("participant_id", trade.target_participant_id)
    .eq("player_id", trade.requested_player_id);

  const { error: acceptError } = await supabaseAdmin
    .from("trades")
    .update({ status: "accepted", resolved_at: new Date().toISOString() })
    .eq("id", trade.id);
  if (acceptError) {
    return NextResponse.json({ error: acceptError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
