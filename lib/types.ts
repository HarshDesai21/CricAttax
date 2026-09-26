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
  // Trade Hub (confirmed design, BUILT this iteration). trade_cap is
  // host-configurable at creation, same step as hint purse/num_rounds --
  // counts every trade a participant has PROPOSED, successful or not, not
  // just accepted ones. trading_ends_at is set the moment the draft
  // completes (advance-round sets it to now() + 30 minutes) and stays null
  // until then; trading_ended_early flips true if the host manually closes
  // the window before it would otherwise expire. Trading is considered
  // active when status === 'complete', trading_ends_at is set, it's still
  // in the future, and trading_ended_early is false.
  trade_cap: number;
  trading_ends_at: string | null;
  trading_ended_early: boolean;
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

export type PlayingXiSlotType = "xi" | "subs";

// A participant's saved Playing XI arrangement -- one row per drafted
// player, publicly readable (see schema.sql) so every player's Playing XI
// is visible to the whole game in real time. `position` orders players
// within their slot_type; for slot_type='xi' it also doubles as the
// jersey number (position 0 -> shirt #1, etc.) per the confirmed visual
// spec. A participant with no saved rows yet just hasn't opened/saved the
// Playing XI page -- the client seeds a sane default (first 11 drafted
// players by round order) and saves it on first load.
export interface PlayingXiEntry {
  id: string;
  participant_id: string;
  player_id: number;
  slot_type: PlayingXiSlotType;
  position: number;
  added_at: string;
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
  // Trade Hub (BUILT this iteration): flips true the moment this card's
  // player changes hands via an accepted trade. A trade-locked player
  // (acquired_via_trade === true) can never be offered in another trade --
  // see design doc "Trade Hub" -- so this is checked on every propose call,
  // both for the offered player (proposer's side) and the requested player
  // (target's side).
  acquired_via_trade: boolean;
}

export type TradeStatus = "pending" | "accepted" | "declined";

// A proposed player-for-player trade -- design doc "Trade Hub". Publicly
// readable within the game (same treatment as playing_xi/round_cards) so
// the confirmed three-tab view (to you / by you / activity feed) can be
// built entirely off one Realtime-synced list, no per-tab fetch needed.
export interface Trade {
  id: string;
  game_id: string;
  proposer_participant_id: string;
  target_participant_id: string;
  offered_player_id: number;
  requested_player_id: number;
  status: TradeStatus;
  created_at: string;
  resolved_at: string | null;
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
