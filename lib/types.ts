export type GameStatus = "lobby" | "drafting" | "complete";

export interface Game {
  id: string;
  room_code: string;
  num_players: number;
  default_hint_purse: number;
  num_rounds: number;
  current_round: number;
  pick_order: string[];
  status: GameStatus;
  created_at: string;
}

export type PlayerRole = "Batter" | "Bowler" | "All-Rounder" | "WK-Batter";

export type PlayerTier = "marquee" | "greats" | "popular" | "random";

export interface Player {
  id: number;
  short_name: string;
  full_name: string;
  country: string;
  is_overseas: boolean;
  role: PlayerRole;
  position: string | null;
  batting_avg: number | null;
  bowling_avg: number | null;
  tier: PlayerTier;
  // Nullable override of full_name for a well-known public alias (e.g. "AB
  // de Villiers"). Display code should prefer this over full_name -- see
  // lib/playerDisplay.ts.
  popular_name: string | null;
}

export interface Franchise {
  id: string;
  display_name: string;
  abbreviation: string;
  primary_color: string;
  secondary_color: string;
  logo_asset_path: string | null;
  is_active: boolean;
}

export type RoundCardStatus = "hidden" | "picked";

// The public-safe shape of a mystery card. `player_id` (and everything
// about the player) stays null until the server reveals it -- see the
// design doc's server-side masking split. `picked_by_participant_id` being
// set just means "someone has claimed this slot," which is intentionally
// visible in real time even while the card's contents are still hidden.
export interface RoundCard {
  id: string;
  game_id: string;
  round_number: number;
  slot_index: number;
  player_id: number | null;
  status: RoundCardStatus;
  picked_by_participant_id: string | null;
  hint_tier_spent: number;
  picked_at: string | null;
  created_at: string;
}

export interface Participant {
  id: string;
  game_id: string;
  seat_number: number;
  team_name: string;
  franchise_id: string | null;
  hint_purse_remaining: number;
  is_host: boolean;
  joined_at: string;
  // reconnect_token is intentionally NOT included here -- it's only ever
  // returned once, directly to the participant who owns it, at
  // create/join time. It's readable via RLS like everything else on this
  // table (there's no auth system to restrict it further), but the API
  // responses and client code in this app never fetch or display other
  // participants' tokens, only their own (stored client-side).
}

// What localStorage holds per game, keyed by room code, so a participant
// can be re-identified as "still seat N" after a refresh.
export interface StoredSession {
  gameId: string;
  participantId: string;
  reconnectToken: string;
  isHost: boolean;
}
