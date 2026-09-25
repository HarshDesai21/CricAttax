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
const INDIAN_WEIGHT = 3;
const OVERSEAS_WEIGHT = 1;
const KEEPER_WEIGHT = 2;
const OTHER_ROLE_WEIGHT = 1;

// Popular and Random deliberately share the same weight -- kept as separate
// tier labels for organizational clarity / future tuning room, not because
// they currently behave differently in the sampler.
const TIER_WEIGHT: Record<Player["tier"], number> = {
  marquee: 4,
  greats: 2.5,
  popular: 2,
  random: 2,
};

export function playerRevealWeight(
  player: Pick<Player, "is_overseas" | "role" | "tier">
): number {
  const nationalityWeight = player.is_overseas ? OVERSEAS_WEIGHT : INDIAN_WEIGHT;
  const roleWeight = player.role === "WK-Batter" ? KEEPER_WEIGHT : OTHER_ROLE_WEIGHT;
  const tierWeight = TIER_WEIGHT[player.tier];
  return nationalityWeight * roleWeight * tierWeight;
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
