import type { Player, RoundCard } from "@/lib/types";

// Shared "what did this participant actually draft, in round order" logic --
// used by both SquadTracker (live during the draft) and the Playing XI
// board (once the draft's complete), so the two screens can never quietly
// disagree about what a team's squad actually is.
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
