import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { activeParticipantId } from "@/lib/draft";
import { displayName } from "@/lib/playerDisplay";
import type { PlayerRole } from "@/lib/types";

interface HintBody {
  participantId: string;
  reconnectToken: string;
  tier: number;
}

// Cumulative tier costs, in crores -- see design doc "Hints (confirmed
// mechanic)": 1cr=Country, 2cr=+Role, 3cr=+Batting/Bowling/Both average
// (role-dependent), 4cr=+Full name. Cost happens to equal the tier number,
// but kept as its own lookup rather than "cost = tier" so the two concepts
// don't get silently conflated if pricing is ever retuned independently.
const TIER_COST: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4 };

interface HintPlayerRow {
  id: number;
  full_name: string;
  popular_name: string | null;
  country: string;
  role: PlayerRole;
  batting_avg: number | null;
  bowling_avg: number | null;
}

// Mirrors MysteryCard's own "which average(s) does this role show" rule, so
// a tier-3 hint promises exactly what the card will actually reveal.
function averagesForRole(player: HintPlayerRow) {
  const battingAvg = player.role !== "Bowler" ? player.batting_avg : null;
  const bowlingAvg =
    player.role === "Bowler" || player.role === "All-Rounder" ? player.bowling_avg : null;
  return { battingAvg, bowlingAvg };
}

// One committed tier, paid for once per round, revealing that tier's info
// for EVERY currently-unclaimed card in the active round -- private to the
// requester only. See design doc "Hints (confirmed mechanic)" and
// "Architecture decision" (why this needs no new public schema: it's all
// computed at request time from the already-private round_card_assignments
// table, gated by the requester's own hint_purse_remaining).
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/hint">
) {
  const { roomCode } = await ctx.params;

  let body: HintBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !body.participantId ||
    !body.reconnectToken ||
    typeof body.tier !== "number" ||
    !Number.isInteger(body.tier) ||
    body.tier < 1 ||
    body.tier > 4
  ) {
    return NextResponse.json(
      { error: "participantId, reconnectToken, and an integer tier (1-4) are required" },
      { status: 400 }
    );
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, num_players, current_round, pick_order, status")
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
    .select("id, game_id, reconnect_token, hint_purse_remaining")
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

  // The round's last picker gets the remaining card automatically -- no
  // choice to make, so no hint option. "Last" means only one unclaimed
  // slot is left once this pick happens.
  const unclaimedCards = roundCards.filter((c) => c.picked_by_participant_id === null);
  if (unclaimedCards.length <= 1) {
    return NextResponse.json(
      { error: "No hints on the last pick of the round -- you get whatever's left" },
      { status: 400 }
    );
  }

  const cost = TIER_COST[body.tier];
  if (participant.hint_purse_remaining < cost) {
    return NextResponse.json(
      { error: `Not enough hint purse remaining (need ${cost}cr, have ${participant.hint_purse_remaining}cr)` },
      { status: 400 }
    );
  }

  // Race/duplicate-safe the same way a card claim is: the unique
  // (participant_id, round_number) constraint on hint_purchases rejects a
  // second purchase this round at the database level, so a double-click or
  // a retried request can't buy two tiers in one round.
  const { error: purchaseError } = await supabaseAdmin.from("hint_purchases").insert({
    game_id: game.id,
    participant_id: participant.id,
    round_number: game.current_round,
    tier: body.tier,
    cost,
  });

  if (purchaseError) {
    if (purchaseError.code === "23505") {
      return NextResponse.json(
        { error: "You've already used a hint this round" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: purchaseError.message }, { status: 500 });
  }

  const newPurseRemaining = participant.hint_purse_remaining - cost;
  const { error: purseError } = await supabaseAdmin
    .from("participants")
    .update({ hint_purse_remaining: newPurseRemaining })
    .eq("id", participant.id);

  if (purseError) {
    // Best-effort rollback of the purchase row so a failed deduction
    // doesn't leave "already used a hint" stuck against nothing charged.
    await supabaseAdmin
      .from("hint_purchases")
      .delete()
      .eq("participant_id", participant.id)
      .eq("round_number", game.current_round);
    return NextResponse.json({ error: purseError.message }, { status: 500 });
  }

  const { data: assignments, error: assignmentsError } = await supabaseAdmin
    .from("round_card_assignments")
    .select("round_card_id, player_id")
    .in(
      "round_card_id",
      unclaimedCards.map((c) => c.id)
    );

  if (assignmentsError || !assignments) {
    return NextResponse.json(
      { error: assignmentsError?.message ?? "Could not load this round's real cards" },
      { status: 500 }
    );
  }

  const playerIds = assignments.map((a) => a.player_id);
  const { data: players, error: playersError } = await supabaseAdmin
    .from("players")
    .select("id, full_name, popular_name, country, role, batting_avg, bowling_avg")
    .in("id", playerIds);

  if (playersError || !players) {
    return NextResponse.json(
      { error: playersError?.message ?? "Could not load player details for the hint" },
      { status: 500 }
    );
  }

  const playerById = new Map(players.map((p) => [p.id, p as HintPlayerRow]));
  const cardIdToSlot = new Map(unclaimedCards.map((c) => [c.id, c.slot_index]));

  const hints = assignments
    .map((a) => {
      const player = playerById.get(a.player_id);
      const slotIndex = cardIdToSlot.get(a.round_card_id);
      if (!player || slotIndex === undefined) return null;

      const hint: {
        slotIndex: number;
        country: string;
        role?: PlayerRole;
        battingAvg?: number | null;
        bowlingAvg?: number | null;
        name?: string;
      } = { slotIndex, country: player.country };

      if (body.tier >= 2) hint.role = player.role;
      if (body.tier >= 3) {
        const { battingAvg, bowlingAvg } = averagesForRole(player);
        hint.battingAvg = battingAvg;
        hint.bowlingAvg = bowlingAvg;
      }
      if (body.tier >= 4) hint.name = displayName(player);

      return hint;
    })
    .filter((h): h is NonNullable<typeof h> => h !== null)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  return NextResponse.json({
    ok: true,
    tier: body.tier,
    costPaid: cost,
    hintPurseRemaining: newPurseRemaining,
    hints,
  });
}
