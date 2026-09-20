import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/roomCode";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const DEFAULT_HINT_PURSE = 20;
const ROOM_CODE_ATTEMPTS = 8;

interface CreateGameBody {
  numPlayers: number;
  hintPurse?: number;
  hostTeamName: string;
}

// Creates a new game (in 'lobby' status) with a unique room code, plus a
// participants row for the host (seat 1, is_host = true). Uses the service
// role client because RLS gives anon clients no write access at all --
// every state-changing action in this app goes through a Route Handler.
export async function POST(request: Request) {
  let body: CreateGameBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { numPlayers, hostTeamName } = body;
  const hintPurse = body.hintPurse ?? DEFAULT_HINT_PURSE;

  if (
    typeof numPlayers !== "number" ||
    numPlayers < MIN_PLAYERS ||
    numPlayers > MAX_PLAYERS
  ) {
    return NextResponse.json(
      { error: `numPlayers must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}` },
      { status: 400 }
    );
  }
  if (!hostTeamName || typeof hostTeamName !== "string" || !hostTeamName.trim()) {
    return NextResponse.json(
      { error: "hostTeamName is required" },
      { status: 400 }
    );
  }
  if (typeof hintPurse !== "number" || hintPurse < 0) {
    return NextResponse.json(
      { error: "hintPurse must be a non-negative number" },
      { status: 400 }
    );
  }

  // Try a handful of random room codes until we land on one that isn't
  // already taken. Collisions are astronomically rare at this alphabet/
  // length, so a small retry loop is simpler and safer than trying to
  // pre-check-then-insert atomically.
  let roomCode: string | null = null;
  let gameId: string | null = null;
  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt++) {
    const candidate = generateRoomCode();
    const { data, error } = await supabaseAdmin
      .from("games")
      .insert({
        room_code: candidate,
        num_players: numPlayers,
        default_hint_purse: hintPurse,
      })
      .select("id, room_code")
      .single();

    if (!error && data) {
      roomCode = data.room_code;
      gameId = data.id;
      break;
    }
    // 23505 = unique_violation. Any other error, surface it immediately
    // rather than silently retrying.
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (!roomCode || !gameId) {
    return NextResponse.json(
      { error: "Could not generate a unique room code, try again" },
      { status: 500 }
    );
  }

  const reconnectToken = randomUUID();
  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .insert({
      game_id: gameId,
      seat_number: 1,
      team_name: hostTeamName.trim(),
      hint_purse_remaining: hintPurse,
      reconnect_token: reconnectToken,
      is_host: true,
    })
    .select("id")
    .single();

  if (participantError || !participant) {
    // Roll back the orphaned game row so a failed host-creation doesn't
    // leave a permanently empty, unjoinable game sitting in the table.
    await supabaseAdmin.from("games").delete().eq("id", gameId);
    return NextResponse.json(
      { error: participantError?.message ?? "Failed to create host participant" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    gameId,
    roomCode,
    participantId: participant.id,
    reconnectToken,
    isHost: true,
  });
}
