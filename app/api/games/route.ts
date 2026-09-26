import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/roomCode";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;
const DEFAULT_HINT_PURSE = 20;
const DEFAULT_NUM_ROUNDS = 25;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 25;
const DEFAULT_TRADE_CAP = 5;
const ROOM_CODE_ATTEMPTS = 8;

interface CreateGameBody {
  numPlayers: number;
  hintPurse?: number;
  numRounds?: number;
  tradeCap?: number;
  hostTeamName: string;
  franchiseId?: string | null;
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
  const numRounds = body.numRounds ?? DEFAULT_NUM_ROUNDS;
  const tradeCap = body.tradeCap ?? DEFAULT_TRADE_CAP;

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
  if (
    typeof numRounds !== "number" ||
    !Number.isInteger(numRounds) ||
    numRounds < MIN_ROUNDS ||
    numRounds > MAX_ROUNDS
  ) {
    return NextResponse.json(
      { error: `numRounds must be a whole number between ${MIN_ROUNDS} and ${MAX_ROUNDS}` },
      { status: 400 }
    );
  }
  if (typeof tradeCap !== "number" || !Number.isInteger(tradeCap) || tradeCap < 0) {
    return NextResponse.json(
      { error: "tradeCap must be a non-negative whole number" },
      { status: 400 }
    );
  }

  const franchiseId = body.franchiseId?.trim() || null;
  if (franchiseId) {
    const { data: franchise, error: franchiseError } = await supabaseAdmin
      .from("franchises")
      .select("id")
      .eq("id", franchiseId)
      .maybeSingle();
    if (franchiseError) {
      return NextResponse.json({ error: franchiseError.message }, { status: 500 });
    }
    if (!franchise) {
      return NextResponse.json({ error: "Unknown franchiseId" }, { status: 400 });
    }
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
        num_rounds: numRounds,
        trade_cap: tradeCap,
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
      franchise_id: franchiseId,
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
