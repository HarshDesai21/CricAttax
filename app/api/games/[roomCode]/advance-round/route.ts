import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rotatePickOrder } from "@/lib/draft";

interface AdvanceRoundBody {
  participantId: string;
  reconnectToken: string;
}

// Host-only: moves the game from "this round is fully revealed" to "next
// round is live." Deliberately its own request, separate from pick/route.ts
// -- see the comment there. The host clicks "Next round" whenever they're
// ready (there's no time pressure; everyone can sit on a fully-revealed
// round as long as they want), and this is the only thing that rotates
// pick_order / bumps current_round / flips the game to 'complete'.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/advance-round">
) {
  const { roomCode } = await ctx.params;

  let body: AdvanceRoundBody;
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
      { error: "Only the host can advance to the next round" },
      { status: 403 }
    );
  }

  const { data: roundCards, error: roundCardsError } = await supabaseAdmin
    .from("round_cards")
    .select("id, status")
    .eq("game_id", game.id)
    .eq("round_number", game.current_round);

  if (roundCardsError || !roundCards) {
    return NextResponse.json(
      { error: roundCardsError?.message ?? "Could not load this round's cards" },
      { status: 500 }
    );
  }
  if (roundCards.length < game.num_players || roundCards.some((c) => c.status !== "picked")) {
    return NextResponse.json(
      { error: "This round isn't fully revealed yet" },
      { status: 400 }
    );
  }

  const pickOrder = (game.pick_order ?? []) as string[];
  const newCurrentRound = game.current_round + 1;
  const gameComplete = newCurrentRound > game.num_rounds;
  const newPickOrder = rotatePickOrder(pickOrder);

  // Trade Hub: the 30-minute trade window starts automatically the instant
  // the draft ends -- no manual host "start trading" step (design doc
  // "Trade Hub"). trading_ends_at is only ever set here, once, the moment
  // this flip happens.
  const TRADE_WINDOW_MS = 30 * 60 * 1000;

  const { error: advanceError } = await supabaseAdmin
    .from("games")
    .update({
      current_round: newCurrentRound,
      pick_order: newPickOrder,
      status: gameComplete ? "complete" : "drafting",
      ...(gameComplete
        ? { trading_ends_at: new Date(Date.now() + TRADE_WINDOW_MS).toISOString() }
        : {}),
    })
    .eq("id", game.id);

  if (advanceError) {
    return NextResponse.json({ error: advanceError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gameComplete });
}
