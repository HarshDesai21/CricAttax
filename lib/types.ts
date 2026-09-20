export type GameStatus = "lobby" | "drafting" | "complete";

export interface Game {
  id: string;
  room_code: string;
  num_players: number;
  default_hint_purse: number;
  current_round: number;
  pick_order: string[];
  status: GameStatus;
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
