import type { Player } from "@/lib/types";

// ============================================================================
// Mystery-box reveal weighting (design doc: "Mystery box reveal weighting")
// ============================================================================
//
// Weighted random sampling WITHOUT replacement, via Efraimidis-Spirakis
// keys: every item gets a key = U^(1/weight) for a fresh uniform random U in
// (0,1], and the N items with the largest keys are taken. Raising a number
// in (0,1) to a smaller fractional power pulls it closer to 1, so a
// higher-weight item tends to produce a bigger key -- but every item still
// gets *some* random key, so nothing is guaranteed. That's exactly the
// "bias the odds, don't guarantee outcomes" rule from the design doc: a
// squad can still end up with zero keepers, it's just less likely.
function weightedSampleWithoutReplacement<T>(
  items: T[],
  weightOf: (item: T) => number,
  count: number
): T[] {
  if (count > items.length) {
    throw new Error(
      `Cannot sample ${count} cards without replacement from a pool of ${items.length} players`
    );
  }
  const keyed = items.map((item) => {
    const weight = Math.max(weightOf(item), 1e-9);
    const u = Math.random() || 1e-9; // guard the astronomically rare exact-0 case
    return { item, key: Math.pow(u, 1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((k) => k.item);
}

// Reveal weighting v2 (design doc, iteration 2) -- retuned nationality tilt
// plus a new player-tier dimension, layered on top of the unchanged role
// tilt. All three dimensions multiply together, so an Indian marquee-tier
// keeper stacks nationality x role x tier -- wider spread than before, and
// intended: the goal is recognizable names surfacing noticeably more often
// without ever being guaranteed (still a pool-level nudge, still sampled
// without replacement, still leaves trading as the fix for genuine bad luck).
const INDIAN_WEIGHT = 5;
const OVERSEAS_WEIGHT = 1;
const KEEPER_WEIGHT = 2;
const OTHER_ROLE_WEIGHT = 1;

// Reveal weighting v3 (live-playtest feedback after v2's first real draft:
// still too many Random-tier players, and "a good amount of Indians" -- i.e.
// not enough big overseas names surfacing). Two changes from v2:
//
// 1. Marquee raised further above the rest -- v2 had it at 4x, only a
//    little above Greats' 2.5x. It should read as clearly the standout
//    tier, not just "somewhat more likely."
// 2. Greats/Popular/Random left exactly as they were in v2 -- the user
//    asked specifically to increase foreign marquee/greats "while keeping
//    others the same," not to retune every tier.
const TIER_WEIGHT: Record<Player["tier"], number> = {
  marquee: 15,
  greats: 9,
  popular: 3,
  random: 2,
};

// Targeted overseas-only boost, layered on TOP of the tier weight above --
// this is the "increase the foreign marquees and greats" ask specifically.
// It only ever multiplies an OVERSEAS player's weight; an Indian player of
// the same tier gets no extra multiplier here (their weight is still just
// INDIAN_WEIGHT x roleWeight x TIER_WEIGHT, completely unchanged from v2),
// and an overseas Popular/Random player also gets no extra multiplier (not
// in this map, so it falls through to the `?? 1` default). The net effect:
// an overseas marquee player now has to overcome the 3:1 Indian:Overseas
// nationality tilt by a much wider margin than before, without touching
// that base tilt or any other tier's numbers.
const OVERSEAS_TIER_BOOST: Partial<Record<Player["tier"], number>> = {
  marquee: 2.5,
  greats: 1.75,
};

export function playerRevealWeight(
  player: Pick<Player, "is_overseas" | "role" | "tier">
): number {
  const nationalityWeight = player.is_overseas ? OVERSEAS_WEIGHT : INDIAN_WEIGHT;
  const roleWeight = player.role === "WK-Batter" ? KEEPER_WEIGHT : OTHER_ROLE_WEIGHT;
  const tierWeight = TIER_WEIGHT[player.tier];
  const overseasTierBoost = player.is_overseas ? (OVERSEAS_TIER_BOOST[player.tier] ?? 1) : 1;
  return nationalityWeight * roleWeight * tierWeight * overseasTierBoost;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface RoundAssignment {
  round_number: number;
  slot_index: number;
  player_id: number;
}

// Builds the ENTIRE draft's card assignments in one pass, at the moment the
// host starts the draft: sample numRounds * numPlayers players from the
// pool (weighted, without replacement), then shuffle that sampled set into
// (round, slot) positions. Doing the whole draft up front like this -- one
// pool, one draw -- keeps the weighted-sampling math simple and means no
// round after the first needs its own "generate this round" step; every
// round's cards already exist as hidden rows, waiting to be claimed.
export function buildRoundAssignments(
  pool: Player[],
  numRounds: number,
  numPlayers: number
): RoundAssignment[] {
  const totalCardsNeeded = numRounds * numPlayers;
  const sampled = weightedSampleWithoutReplacement(
    pool,
    playerRevealWeight,
    totalCardsNeeded
  );
  const shuffled = shuffle(sampled);

  const assignments: RoundAssignment[] = [];
  let i = 0;
  for (let round = 1; round <= numRounds; round++) {
    for (let slot = 0; slot < numPlayers; slot++) {
      assignments.push({
        round_number: round,
        slot_index: slot,
        player_id: shuffled[i].id,
      });
      i++;
    }
  }
  return assignments;
}

// ============================================================================
// Turn order / round rotation (design doc: pick order rotates A,B,C ->
// B,C,A -> C,A,B, ...). Pure functions, safe to import from client code too
// (the lobby/draft UI needs the same "whose turn is it" logic the server
// uses, so both sides agree).
// ============================================================================

export function initialPickOrder(
  participants: { id: string; seat_number: number }[]
): string[] {
  return [...participants]
    .sort((a, b) => a.seat_number - b.seat_number)
    .map((p) => p.id);
}

export function rotatePickOrder(order: string[]): string[] {
  if (order.length === 0) return order;
  const [first, ...rest] = order;
  return [...rest, first];
}

// Whose turn is it, given how many cards have already been claimed this
// round? claimedCount 0 -> first in pick_order, 1 -> second, etc. Returns
// null once the round is fully claimed (claimedCount >= pickOrder.length).
export function activeParticipantId(
  pickOrder: string[],
  claimedCount: number
): string | null {
  return pickOrder[claimedCount] ?? null;
}
