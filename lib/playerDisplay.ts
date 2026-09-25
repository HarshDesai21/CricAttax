import type { Player } from "@/lib/types";

// Iteration 2: every player-facing display (mystery card, squad tracker,
// eventually the Playing XI list) shows popular_name when we have a
// confident one on file, falling back to full_name otherwise -- see the
// design doc's "Player display names" section. Centralized here so every
// call site agrees, rather than each component re-deriving it.
export function displayName(player: Pick<Player, "full_name" | "popular_name">): string {
  return player.popular_name?.trim() ? player.popular_name : player.full_name;
}
