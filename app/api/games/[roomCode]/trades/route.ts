import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

interface ProposeTradeBody {
  participantId: string;
  reconnectToken: string;
  targetParticipantId: string;
  offeredPlayerId: number;
  requestedPlayerId: number;
}

// Proposes a player-for-player trade -- design doc "Trade Hub". Only ever
// creates a 'pending' row; acceptance/decline (and the actual squad swap)
// happens in trades/[tradeId]/respond/route.ts. Validated server-side, not
// just trusted from the request body:
//   - trading must actually be open for this game right now
//   - proposer can't target themselves
//   - the offered player must be in the PROPOSER's current squad and not
//     trade-locked
//   - the requested player must be in the TARGET's current squad and not
//     trade-locked
//   - the proposer's own trade cap (every trade they've proposed, pending
//     or not, counts against it) hasn't been reached
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/trades">
) {
  const { roomCode } = await ctx.params;

  let body: ProposeTradeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.participantId ||
    !body.reconnectToken ||
    !body.targetParticipantId ||
    typeof body.offeredPlayerId !== "number" ||
    typeof body.requestedPlayerId !== "number"
  ) {
    return NextResponse.json(
      {
        error:
          "participantId, reconnectToken, targetParticipantId, offeredPlayerId, and requestedPlayerId are required",
      },
      { status: 400 }
    );
  }
  if (body.targetParticipantId === body.participantId) {
    return NextResponse.json(
      { error: "You can't propose a trade with yourself" },
      { status: 400 }
    );
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, status, trade_cap, trading_ends_at, trading_ended_early")
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
      { error: "Trading only opens once the draft is complete" },
      { status: 400 }
    );
  }
  const windowOpen =
    !!game.trading_ends_at &&
    !game.trading_ended_early &&
    Date.now() < new Date(game.trading_ends_at).getTime();
  if (!windowOpen) {
    return NextResponse.json(
      { error: "The trade window for this game is closed" },
      { status: 400 }
    );
  }

  const { data: proposer, error: proposerError } = await supabaseAdmin
    .from("participants")
    .select("id, game_id, reconnect_token")
    .eq("id", body.participantId)
    .maybeSingle();

  if (proposerError) {
    return NextResponse.json({ error: proposerError.message }, { status: 500 });
  }
  if (
    !proposer ||
    proposer.game_id !== game.id ||
    proposer.reconnect_token !== body.reconnectToken
  ) {
    return NextResponse.json({ error: "Not authorized in this game" }, { status: 403 });
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from("participants")
    .select("id, game_id")
    .eq("id", body.targetParticipantId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 500 });
  }
  if (!target || target.game_id !== game.id) {
    return NextResponse.json({ error: "Unknown target team" }, { status: 400 });
  }

  const { count: proposedCount, error: capError } = await supabaseAdmin
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("game_id", game.id)
    .eq("proposer_participant_id", proposer.id);

  if (capError) {
    return NextResponse.json({ error: capError.message }, { status: 500 });
  }
  if ((proposedCount ?? 0) >= game.trade_cap) {
    return NextResponse.json(
      { error: `You've reached this game's trade cap (${game.trade_cap} proposals)` },
      { status: 400 }
    );
  }

  // The offered player must belong to the PROPOSER's current squad and not
  // be trade-locked; the requested player must belong to the TARGET's
  // current squad and not be trade-locked. picked_by_participant_id already
  // reflects current ownership (it's repointed on every accepted trade --
  // see respond/route.ts), so this one query per side is sufficient.
  const { data: offeredCard, error: offeredError } = await supabaseAdmin
    .from("round_cards")
    .select("id, acquired_via_trade")
    .eq("game_id", game.id)
    .eq("player_id", body.offeredPlayerId)
    .eq("picked_by_participant_id", proposer.id)
    .eq("status", "picked")
    .maybeSingle();

  if (offeredError) {
    return NextResponse.json({ error: offeredError.message }, { status: 500 });
  }
  if (!offeredCard) {
    return NextResponse.json(
      { error: "That player isn't in your current squad" },
      { status: 400 }
    );
  }
  if (offeredCard.acquired_via_trade) {
    return NextResponse.json(
      { error: "A player acquired via trade can't be traded away again" },
      { status: 400 }
    );
  }

  const { data: requestedCard, error: requestedError } = await supabaseAdmin
    .from("round_cards")
    .select("id, acquired_via_trade")
    .eq("game_id", game.id)
    .eq("player_id", body.requestedPlayerId)
    .eq("picked_by_participant_id", target.id)
    .eq("status", "picked")
    .maybeSingle();

  if (requestedError) {
    return NextResponse.json({ error: requestedError.message }, { status: 500 });
  }
  if (!requestedCard) {
    return NextResponse.json(
      { error: "That player isn't in the target team's current squad" },
      { status: 400 }
    );
  }
  if (requestedCard.acquired_via_trade) {
    return NextResponse.json(
      { error: "That player was acquired via trade and can't be traded away" },
      { status: 400 }
    );
  }

  const { data: trade, error: insertError } = await supabaseAdmin
    .from("trades")
    .insert({
      game_id: game.id,
      proposer_participant_id: proposer.id,
      target_participant_id: target.id,
      offered_player_id: body.offeredPlayerId,
      requested_player_id: body.requestedPlayerId,
    })
    .select("id")
    .single();

  if (insertError || !trade) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to propose trade" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, tradeId: trade.id });
}
