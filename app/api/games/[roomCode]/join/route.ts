import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

interface JoinBody {
  teamName: string;
  franchiseId?: string | null;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/games/[roomCode]/join">
) {
  const { roomCode } = await ctx.params;

  let body: JoinBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.teamName || typeof body.teamName !== "string" || !body.teamName.trim()) {
    return NextResponse.json({ error: "teamName is required" }, { status: 400 });
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from("games")
    .select("id, num_players, default_hint_purse, status")
    .eq("room_code", roomCode.toUpperCase())
    .maybeSingle();

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game found with that room code" }, { status: 404 });
  }
  if (game.status !== "lobby") {
    return NextResponse.json(
      { error: "This game has already started" },
      { status: 400 }
    );
  }

  const { count, error: countError } = await supabaseAdmin
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("game_id", game.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  const currentCount = count ?? 0;
  if (currentCount >= game.num_players) {
    return NextResponse.json({ error: "This game's lobby is full" }, { status: 400 });
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

  const reconnectToken = randomUUID();
  const { data: participant, error: participantError } = await supabaseAdmin
    .from("participants")
    .insert({
      game_id: game.id,
      seat_number: currentCount + 1,
      team_name: body.teamName.trim(),
      franchise_id: franchiseId,
      hint_purse_remaining: game.default_hint_purse,
      reconnect_token: reconnectToken,
      is_host: false,
    })
    .select("id, seat_number")
    .single();

  if (participantError || !participant) {
    // Two realistic races land here: two people submitting the join form at
    // the same instant (unique(game_id, seat_number)), or two people
    // submitting the SAME franchise within that same narrow window
    // (unique(game_id, franchise_id)) -- e.g. both saw it as available,
    // then one of them loses the DB race. Both are caught as Postgres
    // unique-violation 23505, but the client needs to react differently to
    // each: a seat conflict just means "retry the join," while a franchise
    // conflict means "that franchise is gone, force me to pick another one"
    // -- letting the loser silently resubmit the same now-taken franchise
    // would just produce the same conflict again. Postgres's default
    // constraint name for an unnamed unique(...) table constraint is
    // "<table>_<col1>_<col2>_key", so the message reliably contains
    // "franchise_id" only for that specific constraint.
    if (participantError?.code === "23505") {
      const isFranchiseConflict =
        franchiseId != null &&
        (participantError.message?.includes("franchise_id") ||
          participantError.details?.includes("franchise_id"));
      if (isFranchiseConflict) {
        return NextResponse.json(
          {
            error: "That franchise was just taken -- please choose another one",
            conflict: "franchise",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error: "Someone just took that seat -- refresh and try again",
          conflict: "seat",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: participantError?.message ?? "Failed to join game" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    gameId: game.id,
    participantId: participant.id,
    reconnectToken,
    seatNumber: participant.seat_number,
    isHost: false,
  });
}
