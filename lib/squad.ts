import type { Player, RoundCard } from "@/lib/types";

// Shared "what did this participant actually draft, in round order" logic --
// used by SquadTracker (live during the draft), the Playing XI board (once
// the draft's complete), and TradeHub (which player-for-player pairs are
// even proposable). A trade acceptance repoints a round_card's
// picked_by_participant_id to the new owner (see schema.sql), so this
// always reflects CURRENT squad ownership, not just who originally drafted
// each player -- one source of truth for "who has who" that trades keep in
// sync automatically, no separate roster table needed.
export function squadForParticipant(
  participantId: string,
  roundCards: RoundCard[],
  players: Map<number, Player>
): Player[] {
  return roundCards
    .filter(
      (c) =>
        c.picked_by_participant_id === participantId &&
        c.status === "picked" &&
        c.player_id != null
    )
    .sort((a, b) => a.round_number - b.round_number)
    .map((c) => players.get(c.player_id as number))
    .filter((p): p is Player => !!p);
}

// Trade Hub: a player who arrived via an earlier accepted trade can never be
// offered away in a later one (design doc's "trade-lock" rule, bounding how
// long a trade chain can run). Returns the set of a participant's CURRENT
// player ids that are locked this way.
export function tradeLockedPlayerIds(
  participantId: string,
  roundCards: RoundCard[]
): Set<number> {
  return new Set(
    roundCards
      .filter(
        (c) =>
          c.picked_by_participant_id === participantId &&
          c.status === "picked" &&
          c.acquired_via_trade &&
          c.player_id != null
      )
      .map((c) => c.player_id as number)
  );
}
