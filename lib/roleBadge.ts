import type { PlayerRole } from "@/lib/types";

// Short role abbreviations for compact list UI (SquadTracker, and later the
// Playing XI list) -- distinct from the mystery card's bottom plate, which
// spells the role out in full ("Wicketkeeper batter" etc.) since there's
// room there and no risk of redundancy with the card's other text.
export const ROLE_BADGE_TEXT: Record<PlayerRole, string> = {
  Batter: "BAT",
  Bowler: "BWL",
  "All-Rounder": "AR",
  "WK-Batter": "WK",
};
