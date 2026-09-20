"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { loadSession, saveSession } from "@/lib/session";
import type { Game, Participant, StoredSession } from "@/lib/types";
import {
  Heading,
  Panel,
  Button,
  TextInput,
  FieldLabel,
  ErrorText,
  RoomCodeBadge,
} from "@/components/ui";

export default function LobbyPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = (params.roomCode ?? "").toUpperCase();

  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  // Inline join form, shown when this browser has no stored session for
  // this room code yet (e.g. someone opened a shared lobby link directly).
  const [joinTeamName, setJoinTeamName] = useState("");
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadParticipants = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("participants")
      .select("*")
      .eq("game_id", gameId)
      .order("seat_number", { ascending: true });
    setParticipants((data as Participant[]) ?? []);
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    // localStorage doesn't exist during server rendering, so this can't be
    // done as a lazy useState initializer -- it has to run post-hydration,
    // inside an effect, reading an external (browser-only) system once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(loadSession(roomCode));

    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: gameRow, error: gameError } = await supabase
        .from("games")
        .select("*")
        .eq("room_code", roomCode)
        .maybeSingle();

      if (gameError || !gameRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setGame(gameRow as Game);
      await loadParticipants(gameRow.id);
      setLoading(false);

      channel = supabase
        .channel(`game:${gameRow.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "participants",
            filter: `game_id=eq.${gameRow.id}`,
          },
          () => loadParticipants(gameRow.id)
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            filter: `id=eq.${gameRow.id}`,
          },
          (payload) => setGame(payload.new as Game)
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomCode, loadParticipants]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setJoining(true);
    try {
      const res = await fetch(`/api/games/${roomCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: joinTeamName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to join game");
        setJoining(false);
        return;
      }
      const newSession: StoredSession = {
        gameId: data.gameId,
        participantId: data.participantId,
        reconnectToken: data.reconnectToken,
        isHost: false,
      };
      saveSession(roomCode, newSession);
      setSession(newSession);
      if (game) await loadParticipants(game.id);
    } catch {
      setError("Network error -- try again");
    } finally {
      setJoining(false);
    }
  }

  async function handleStart() {
    if (!session) return;
    setError("");
    setStarting(true);
    try {
      const res = await fetch(`/api/games/${roomCode}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start draft");
      }
    } catch {
      setError("Network error -- try again");
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return <CenteredMessage>Loading lobby...</CenteredMessage>;
  }
  if (notFound) {
    return <CenteredMessage>No game found with room code {roomCode}.</CenteredMessage>;
  }
  if (!game) return null;

  const seatsFilled = participants.length;
  const seatsTotal = game.num_players;
  const canStart = session?.isHost && seatsFilled === seatsTotal && game.status === "lobby";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-20">
      <div className="text-center">
        <p className="mb-1 font-body text-sm uppercase tracking-wide text-silver/60">
          Room code
        </p>
        <RoomCodeBadge code={roomCode} />
      </div>

      {game.status === "drafting" ? (
        <Panel className="w-full max-w-sm text-center">
          <Heading className="mb-2 text-2xl">Draft starting...</Heading>
          <p className="font-body text-silver/70">
            The draft engine isn&apos;t built yet -- this is where the mystery
            box reveal will begin.
          </p>
        </Panel>
      ) : (
        <Panel className="w-full max-w-sm">
          <div className="mb-4 flex items-center justify-between">
            <Heading className="text-xl">Lobby</Heading>
            <span className="font-body text-sm text-silver/60">
              {seatsFilled} / {seatsTotal} joined
            </span>
          </div>

          <ul className="mb-5 space-y-2">
            {participants.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-silver/15 bg-black/20 px-3 py-2"
              >
                <span className="font-body text-silver">
                  Seat {p.seat_number}: {p.team_name}
                </span>
                {p.is_host && (
                  <span className="font-body text-xs uppercase tracking-wide text-gold">
                    Host
                  </span>
                )}
              </li>
            ))}
            {Array.from({ length: seatsTotal - seatsFilled }).map((_, i) => (
              <li
                key={`empty-${i}`}
                className="rounded border border-dashed border-silver/15 px-3 py-2 font-body text-silver/40"
              >
                Waiting for player...
              </li>
            ))}
          </ul>

          {!session && (
            <form onSubmit={handleJoin} className="space-y-3">
              <FieldLabel>Join this game -- your team name</FieldLabel>
              <TextInput
                value={joinTeamName}
                onChange={(e) => setJoinTeamName(e.target.value)}
                placeholder="e.g. Thunder XI"
                maxLength={40}
                required
              />
              <Button type="submit" disabled={joining} className="w-full">
                {joining ? "Joining..." : "Join"}
              </Button>
            </form>
          )}

          {session?.isHost && (
            <Button
              onClick={handleStart}
              disabled={!canStart || starting}
              className="w-full"
            >
              {starting
                ? "Starting..."
                : canStart
                  ? "Start draft"
                  : `Waiting for ${seatsTotal - seatsFilled} more player(s)`}
            </Button>
          )}

          <ErrorText>{error}</ErrorText>
        </Panel>
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center font-body text-silver/70">
      {children}
    </div>
  );
}
