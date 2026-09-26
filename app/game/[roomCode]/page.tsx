"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { loadSession, saveSession } from "@/lib/session";
import type {
  Franchise,
  Game,
  Participant,
  PlayingXiEntry,
  Player,
  RoundCard,
  StoredSession,
  Trade,
} from "@/lib/types";
import type { PrivateHint } from "@/components/MysteryCard";
import {
  Heading,
  Panel,
  Button,
  TextInput,
  FieldLabel,
  ErrorText,
  RoomCodeBadge,
  Modal,
} from "@/components/ui";
import { DraftBoard } from "@/components/DraftBoard";
import { SquadTracker } from "@/components/SquadTracker";
import { PlayingXIBoard } from "@/components/PlayingXI";
import { TradeHub } from "@/components/TradeHub";

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
  // Franchise reference data (colors + logos, for SquadTracker/Playing XI
  // theming) -- public, rarely changes, so a single fetch on mount is
  // enough; no Realtime subscription needed for it.
  const [franchises, setFranchises] = useState<Franchise[]>([]);
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

  // Playing XI (mini-iteration pulled forward from iteration 3, ahead of
  // Trading). Public within the game -- like round_cards, loaded once and
  // kept in sync via the same Realtime channel below.
  const [playingXi, setPlayingXi] = useState<PlayingXiEntry[]>([]);
  const [playingXiError, setPlayingXiError] = useState("");

  // Trade Hub (BUILT this iteration) -- public within the game, same
  // treatment as playing_xi, but trades DOES carry its own game_id column
  // so the Realtime filter below can be server-side rather than reload-and-
  // refilter like playing_xi has to.
  const [trades, setTrades] = useState<Trade[]>([]);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState("");
  const [respondingTradeId, setRespondingTradeId] = useState<string | null>(null);
  const [endingTrading, setEndingTrading] = useState(false);
  // Trade Hub now lives in a modal, opened from a button on the Playing XI
  // page rather than always being visible inline (per feedback) -- this is
  // the only new state that requires.
  const [isTradeHubOpen, setIsTradeHubOpen] = useState(false);

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

  const loadPlayingXi = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("playing_xi")
      .select("*, participants!inner(game_id)")
      .eq("participants.game_id", gameId);
    setPlayingXi((data as PlayingXiEntry[]) ?? []);
  }, []);

  const loadTrades = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });
    setTrades((data as Trade[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("franchises").select("*");
      setFranchises((data as Franchise[]) ?? []);
    })();
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
      if (gameRow.status === "complete") {
        await loadPlayingXi(gameRow.id);
        await loadTrades(gameRow.id);
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
            if (updated.status === "complete") {
              loadPlayingXi(gameRow.id);
              loadTrades(gameRow.id);
            }
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
        .on(
          "postgres_changes",
          {
            // playing_xi has no game_id column of its own (it's scoped via
            // participant_id -> participants.game_id), so it can't carry a
            // server-side filter the way the tables above do -- this
            // channel is already scoped to one game/room, so just reload on
            // any change and let loadPlayingXi's own game_id-scoped query
            // do the real filtering.
            event: "*",
            schema: "public",
            table: "playing_xi",
          },
          () => loadPlayingXi(gameRow.id)
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trades",
            filter: `game_id=eq.${gameRow.id}`,
          },
          () => loadTrades(gameRow.id)
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
  }, [roomCode, loadParticipants, loadRoundCards, loadPlayingXi, loadTrades]);

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

  async function handleSavePlayingXi(xi: number[], subs: number[]) {
    if (!session) return;
    setPlayingXiError("");
    try {
      const res = await fetch(`/api/games/${roomCode}/playing-xi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
          xi,
          subs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlayingXiError(data.error ?? "Failed to save your Playing XI");
        return;
      }
      // The server is now the source of truth for this arrangement --
      // reload immediately rather than waiting on the Realtime round-trip,
      // so the drag feels responsive even on a slow connection.
      if (game) await loadPlayingXi(game.id);
    } catch {
      setPlayingXiError("Network error -- try again");
    }
  }

  async function handleProposeTrade(
    targetParticipantId: string,
    offeredPlayerId: number,
    requestedPlayerId: number
  ) {
    if (!session) return;
    setProposeError("");
    setProposing(true);
    try {
      const res = await fetch(`/api/games/${roomCode}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
          targetParticipantId,
          offeredPlayerId,
          requestedPlayerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProposeError(data.error ?? "Failed to propose that trade");
        return;
      }
      if (game) await loadTrades(game.id);
    } catch {
      setProposeError("Network error -- try again");
    } finally {
      setProposing(false);
    }
  }

  async function handleRespondTrade(tradeId: string, accept: boolean) {
    if (!session) return;
    setProposeError("");
    setRespondingTradeId(tradeId);
    try {
      const res = await fetch(`/api/games/${roomCode}/trades/${tradeId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
          accept,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProposeError(data.error ?? "Failed to respond to that trade");
        return;
      }
      if (game) {
        await loadTrades(game.id);
        await loadRoundCards(game.id);
        await loadPlayingXi(game.id);
      }
    } catch {
      setProposeError("Network error -- try again");
    } finally {
      setRespondingTradeId(null);
    }
  }

  async function handleEndTrading() {
    if (!session) return;
    setEndingTrading(true);
    try {
      await fetch(`/api/games/${roomCode}/end-trading`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: session.participantId,
          reconnectToken: session.reconnectToken,
        }),
      });
    } finally {
      setEndingTrading(false);
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

  const myParticipant = participants.find((p) => p.id === session?.participantId) ?? null;
  const pendingTradesForMe = trades.filter(
    (t) => t.target_participant_id === session?.participantId && t.status === "pending"
  ).length;

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 py-10 sm:px-6 sm:py-20">
      {/* Fixed, always-on-screen hint purse -- per feedback, the purse
          number used to only appear inside HintPanel, which is itself only
          shown during that participant's own turn. It needs to be visible
          throughout the draft, not just then. */}
      {game.status === "drafting" && myParticipant && (
        <div className="fixed right-3 top-3 z-20 rounded-lg border border-gold/50 bg-stock/90 px-3 py-1.5 text-center shadow-lg shadow-black/40 backdrop-blur sm:right-4 sm:top-4 sm:px-4 sm:py-2">
          <p className="font-body text-[9px] uppercase tracking-wide text-silver/50 sm:text-[10px]">
            Hint purse
          </p>
          <p className="font-display text-lg leading-tight text-gold-light sm:text-xl">
            {myParticipant.hint_purse_remaining}cr
          </p>
        </div>
      )}

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
          hintPurseRemaining={myParticipant?.hint_purse_remaining ?? 0}
          hintUsedThisRound={hintUsedThisRound}
          hintsBySlot={hintsBySlot}
          requestingHint={requestingHint}
          hintError={hintError}
          onRequestHint={handleRequestHint}
        />
      ) : game.status === "complete" ? (
        <>
          <PlayingXIBoard
            participants={participants}
            roundCards={roundCards}
            players={playersCache}
            franchises={franchises}
            playingXi={playingXi}
            myParticipantId={session?.participantId ?? null}
            onSaveMine={handleSavePlayingXi}
            saveError={playingXiError}
          />

          {/* Floating trigger for the Trade Hub modal, with a badge for how
              many trades are waiting on this participant's own response --
              the number people most want to check at a glance. */}
          <button
            type="button"
            onClick={() => setIsTradeHubOpen(true)}
            className="fixed bottom-5 right-4 z-30 flex items-center gap-2 rounded-full border border-gold/50 bg-stock/95 px-5 py-3 font-body text-sm font-semibold uppercase tracking-wide text-gold-light shadow-lg shadow-black/40 backdrop-blur transition hover:bg-stock sm:bottom-6 sm:right-6"
          >
            Trade Hub
            {pendingTradesForMe > 0 && (
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gold px-1 font-body text-xs font-bold text-stock">
                {pendingTradesForMe}
              </span>
            )}
          </button>

          {isTradeHubOpen && (
            <Modal onClose={() => setIsTradeHubOpen(false)} className="w-full sm:max-w-2xl">
              <TradeHub
                game={game}
                participants={participants}
                players={playersCache}
                roundCards={roundCards}
                franchises={franchises}
                trades={trades}
                myParticipantId={session?.participantId ?? null}
                isHost={!!session?.isHost}
                onPropose={handleProposeTrade}
                onRespond={handleRespondTrade}
                onEndTrading={handleEndTrading}
                proposing={proposing}
                proposeError={proposeError}
                respondingTradeId={respondingTradeId}
                endingTrading={endingTrading}
              />
            </Modal>
          )}
        </>
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

      {game.status === "drafting" && (
        <SquadTracker
          participants={participants}
          roundCards={roundCards}
          players={playersCache}
          franchises={franchises}
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
