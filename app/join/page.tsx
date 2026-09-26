"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heading,
  Panel,
  Button,
  TextInput,
  FieldLabel,
  ErrorText,
} from "@/components/ui";
import { FranchisePicker } from "@/components/FranchisePicker";
import { saveSession } from "@/lib/session";
import { supabase } from "@/lib/supabase/client";
import type { Franchise } from "@/lib/types";

// Bug fix (live-playtest report): the team-name/franchise/Join step used to
// render immediately, before the room code was even confirmed to be a real,
// joinable lobby. That let someone pick a franchise (seeing it as available)
// before this browser had even looked up which franchises the room's
// existing participants had already claimed -- and if they were quick
// enough, hit Join before the picker had a chance to gray anything out,
// letting two people land on the same franchise. Now the whole team-
// name/franchise/Join step is gated behind a confirmed, joinable room code:
// nothing below the code field renders until the lookup below has actually
// resolved to a real, still-open lobby, so the taken-franchise data is
// always loaded first.
type CodeStatus = "idle" | "checking" | "valid" | "not_found" | "unjoinable";

export default function JoinGamePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [codeStatus, setCodeStatus] = useState<CodeStatus>("idle");
  const [lobbyMessage, setLobbyMessage] = useState("");

  const [teamName, setTeamName] = useState("");
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [takenFranchiseIds, setTakenFranchiseIds] = useState<Set<string>>(new Set());
  const [franchiseId, setFranchiseId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Franchise reference data loads once, independent of which room the
  // person types in.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("franchises")
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      setFranchises((data as Franchise[]) ?? []);
    })();
  }, []);

  // The single source of truth for whether the rest of the form is allowed
  // to show at all. Only once this resolves to "valid" (a real game, still
  // in 'lobby', with an open seat) do team name / franchise / Join appear --
  // and by that point takenFranchiseIds is already loaded, so the picker
  // never shows a franchise as available when it isn't.
  useEffect(() => {
    const code = roomCode.trim().toUpperCase();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFranchiseId(null);
    if (code.length !== 6) {
      setCodeStatus("idle");
      setLobbyMessage("");
      setTakenFranchiseIds(new Set());
      return;
    }
    let cancelled = false;
    setCodeStatus("checking");
    setLobbyMessage("");
    (async () => {
      const { data: game } = await supabase
        .from("games")
        .select("id, status, num_players")
        .eq("room_code", code)
        .maybeSingle();
      if (cancelled) return;
      if (!game) {
        setCodeStatus("not_found");
        return;
      }
      if (game.status !== "lobby") {
        setCodeStatus("unjoinable");
        setLobbyMessage("This game has already started.");
        return;
      }
      const { data: existingParticipants } = await supabase
        .from("participants")
        .select("franchise_id")
        .eq("game_id", game.id);
      if (cancelled) return;
      if ((existingParticipants?.length ?? 0) >= game.num_players) {
        setCodeStatus("unjoinable");
        setLobbyMessage("This game's lobby is full.");
        return;
      }
      setTakenFranchiseIds(
        new Set(
          (existingParticipants ?? [])
            .map((p) => p.franchise_id as string | null)
            .filter((id): id is string => id != null)
        )
      );
      setCodeStatus("valid");
    })();
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (codeStatus !== "valid") return;
    setError("");
    setSubmitting(true);
    const code = roomCode.trim().toUpperCase();
    try {
      const res = await fetch(`/api/games/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName, franchiseId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to join game");
        // A 409 here can mean the franchise (or the last seat) got taken by
        // someone else in the moment between confirming the code and
        // submitting -- re-run the same lookup so the picker reflects
        // reality before they try again. When it's specifically a franchise
        // conflict (two people picked the same one in a close race and this
        // browser lost), also clear the stale selection so they're forced
        // to pick a different, still-open franchise rather than getting
        // stuck resubmitting the one that's now gone.
        if (res.status === 409) {
          if (data.conflict === "franchise") {
            setFranchiseId(null);
          }
          const { data: game } = await supabase
            .from("games")
            .select("id")
            .eq("room_code", code)
            .maybeSingle();
          if (game) {
            const { data: existingParticipants } = await supabase
              .from("participants")
              .select("franchise_id")
              .eq("game_id", game.id);
            setTakenFranchiseIds(
              new Set(
                (existingParticipants ?? [])
                  .map((p) => p.franchise_id as string | null)
                  .filter((id): id is string => id != null)
              )
            );
          }
        }
        setSubmitting(false);
        return;
      }
      saveSession(code, {
        gameId: data.gameId,
        participantId: data.participantId,
        reconnectToken: data.reconnectToken,
        isHost: false,
      });
      router.push(`/game/${code}`);
    } catch {
      setError("Network error -- try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <Heading className="mb-6 text-center text-3xl">Join a game</Heading>
        <Panel>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <FieldLabel>Room code</FieldLabel>
              <TextInput
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. K7QX2P"
                maxLength={6}
                className="text-center font-display text-xl tracking-[0.3em]"
                required
              />
              {codeStatus === "checking" && (
                <p className="mt-2 font-body text-xs text-silver/50">Checking room code...</p>
              )}
              {codeStatus === "not_found" && (
                <p className="mt-2 font-body text-xs text-red-400">
                  No game found with that room code.
                </p>
              )}
              {codeStatus === "unjoinable" && (
                <p className="mt-2 font-body text-xs text-red-400">{lobbyMessage}</p>
              )}
            </div>

            {/* Team name, franchise picker, and the Join button are only
                revealed once the room code above has resolved to a real,
                still-open lobby -- see the note at the top of this file. */}
            {codeStatus === "valid" && (
              <>
                <div>
                  <FieldLabel>Your team name</FieldLabel>
                  <TextInput
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g. Thunder XI"
                    maxLength={40}
                    required
                    autoFocus
                  />
                </div>

                {franchises.length > 0 && (
                  <div>
                    <FieldLabel>Franchise (optional)</FieldLabel>
                    <FranchisePicker
                      franchises={franchises}
                      takenFranchiseIds={takenFranchiseIds}
                      selectedFranchiseId={franchiseId}
                      onSelect={setFranchiseId}
                    />
                  </div>
                )}

                <ErrorText>{error}</ErrorText>

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Joining..." : "Join game"}
                </Button>
              </>
            )}
          </form>
        </Panel>
      </div>
    </div>
  );
}
