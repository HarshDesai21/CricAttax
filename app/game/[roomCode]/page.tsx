"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { loadSession, saveSession } from "@/lib/session";
import type { Game, Participant, Player, RoundCard, StoredSession } from "@/lib/types";
import type { PrivateHint } from "@/components/MysteryCard";
import {
  Heading,
  Panel,
  Button,
  TextInput,
  FieldLabel,
  ErrorText,
  RoomCodeBadge,
} from "@/components/ui";
import { DraftBoard } from "@/components/DraftBoard";
import { SquadTracker } from "@/components/SquadTracker";

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

  // Draft state -- only populated once the game leaves 'lobby'. roundCards
  // holds every round's cards for the whole game (cheap at this scale,
  // <=125 rows), filtered down to the current round at render time so a
  // stale closure over "current round" can't get this out of sync.
  const [roundCards, setRoundCards] = useState<RoundCard[]>([]);
  const [playersCache, setPlayersCache] = useState<Map<number, Player>>(new Map());
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState("");
  const [advancing, setAdvancing] = useState(false);

  // Hints (iteration 2) -- hintsBySlot and hintUsedThisRound are local-only
  // and deliberately never fetched from the server: a hint purchase is
  // private to the browser that paid for it (see hint/route.ts), so there's
  // nothing to sync via Realtime here. Both reset whenever current_round
  // changes, since a hint only ever covers the round it was bought in.
  const [hintsBySlot, setHintsBySlot] = useState<Map<number, PrivateHint>>(new Map());
  const [hintUsedThisRound, setHintUsedThisRound] = useState(false);
  const [requestingHint, setRequestingHint] = useState(false);
  const [hintError, setHintError] = useState("");

  const loadParticipants = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("participants")
      .select("*")
      .eq("game_id", gameId)
      .order("seat_number", { ascending: true });
    setParticipants((data as Participant[]) ?? []);
  }, []);

  const loadRoundCards = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("round_cards")
      .select("*")
      .eq("game_id", gameId)
      .order("round_number", { ascending: true })
      .order("slot_index", { ascending: true });
    setRoundCards((data as RoundCard[]) ?? []);
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
      if (gameRow.status !== "lobby") {
        await loadRoundCards(gameRow.id);
      }
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
          (payload) => {
            const updated = payload.new as Game;
            setGame(updated);
            if (updated.status !== "lobby") loadRoundCards(gameRow.id);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "round_cards",
            filter: `game_id=eq.${gameRow.id}`,
          },
          () => loadRoundCards(gameRow.id)
        )
        .subscribe((status, err) => {
          // Realtime subscriptions fail silently by default -- without this,
          // a broken WebSocket connection looks identical (from the UI) to a
          // slow one, and the only symptom is "nothing updates until I
          // refresh." Logging the status makes that failure visible.
          if (status === "SUBSCRIBED") {
            console.log("[Cricattax] Realtime connected:", gameRow.id);
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.error("[Cricattax] Realtime subscription problem:", status, err);
          }
        });
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomCode, loadParticipants, loadRoundCards]);

  // Backfills real player details for any newly-revealed cards. round_cards
  // itself only ever carries a player_id -- the name/country/role/averages
  // live in the public `players` table, fetched here in batches keyed off
  // whatever ids we haven't already cached.
  useEffect(() => {
    const revealedIds = [
      ...new Set(
        roundCards
          .filter((c) => c.player_id != null)
          .map((c) => c.player_id as number)
      ),
    ];
    const missing = revealedIds.filter((id) => !playersCache.has(id));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.from("players").select("*").in("id", missing);
      if (!data) return;
      setPlayersCache((prev) => {
        const next = new Map(prev);
        for (const p of data as Player[]) next.set(p.id, p);
        return next;
      });
    })();
  }, [roundCards, playersCache]);

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

  // A hint's private overlay data and "already used this round" flag only
  // ever apply to the round they were bought in -- this just resets local
  // UI state to match an external value (current_round) changing, not a
  // derived value React could compute during render instead.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHintsBySlot(new Map());
    setHintUsedThisRound(false);
    setHintError("");
  }, [game?.current_round]);

  async function handleRequestHint(tier: number) {
    if (!session) return;
    setHintError("");
    setRequestingHint(true);
    try {
      const res = await fetch(`/api/games/${roomCode}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
          tier,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHintError(data.error ?? "Failed to buy that hint");
        // A 409 here means the server already has a hint on file for this
        // round (e.g. a stale client after a refresh) -- treat it the same
        // as a successful purchase so the buttons don't stay live.
        if (res.status === 409) setHintUsedThisRound(true);
        return;
      }
      setHintUsedThisRound(true);
      setHintsBySlot(
        new Map(
          (data.hints as (PrivateHint & { slotIndex: number })[]).map((h) => [h.slotIndex, h])
        )
      );
    } catch {
      setHintError("Network error -- try again");
    } finally {
      setRequestingHint(false);
    }
  }

  async function handlePick(slotIndex: number) {
    if (!session) return;
    setPickError("");
    setPicking(true);
    try {
      const res = await fetch(`/api/games/${roomCode}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
          slotIndex,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPickError(data.error ?? "Failed to pick that card");
      }
    } catch {
      setPickError("Network error -- try again");
    } finally {
      setPicking(false);
    }
  }

  async function handleAdvanceRound() {
    if (!session) return;
    setPickError("");
    setAdvancing(true);
    try {
      const res = await fetch(`/api/games/${roomCode}/advance-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPickError(data.error ?? "Failed to advance to the next round");
      }
    } catch {
      setPickError("Network error -- try again");
    } finally {
      setAdvancing(false);
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

  const isDraftPhase = game.status === "drafting" || game.status === "complete";

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10 sm:px-6 sm:py-20">
      <div className="text-center">
        <p className="mb-1 font-body text-sm uppercase tracking-wide text-silver/60">
          Room code
        </p>
        <RoomCodeBadge code={roomCode} />
      </div>

      {game.status === "drafting" ? (
        <DraftBoard
          roundCards={roundCards.filter((c) => c.round_number === game.current_round)}
          numPlayers={game.num_players}
          numRounds={game.num_rounds}
          currentRound={game.current_round}
          pickOrder={game.pick_order}
          players={playersCache}
          participantNames={new Map(participants.map((p) => [p.id, p.team_name]))}
          myParticipantId={session?.participantId ?? null}
          isHost={!!session?.isHost}
          onPick={handlePick}
          onAdvanceRound={handleAdvanceRound}
          picking={picking}
          advancing={advancing}
          error={pickError}
          hintPurseRemaining={
            participants.find((p) => p.id === session?.participantId)?.hint_purse_remaining ?? 0
          }
          hintUsedThisRound={hintUsedThisRound}
          hintsBySlot={hintsBySlot}
          requestingHint={requestingHint}
          hintError={hintError}
          onRequestHint={handleRequestHint}
        />
      ) : game.status === "complete" ? (
        <Panel className="w-full max-w-sm text-center">
          <Heading className="mb-2 text-2xl">Draft complete!</Heading>
          <p className="font-body text-silver/70">
            Every round has been picked and revealed. The Playing XI builder
            and trading aren&apos;t built yet -- that&apos;s next.
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

      {isDraftPhase && (
        <SquadTracker
          participants={participants}
          roundCards={roundCards}
          players={playersCache}
        />
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
