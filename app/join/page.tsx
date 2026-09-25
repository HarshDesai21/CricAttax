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

export default function JoinGamePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
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

  // Once a full 6-character room code is typed, look up which franchises
  // this specific game's existing participants have already claimed, so
  // the picker can gray those out before the person even submits -- rather
  // than only finding out from a 409 after picking a taken one.
  useEffect(() => {
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 6) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTakenFranchiseIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: game } = await supabase
        .from("games")
        .select("id")
        .eq("room_code", code)
        .maybeSingle();
      if (!game || cancelled) return;
      const { data: existingParticipants } = await supabase
        .from("participants")
        .select("franchise_id")
        .eq("game_id", game.id);
      if (cancelled) return;
      setTakenFranchiseIds(
        new Set(
          (existingParticipants ?? [])
            .map((p) => p.franchise_id as string | null)
            .filter((id): id is string => id != null)
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [roomCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        // A 409 here can mean the franchise got taken by someone else in
        // the moment between loading the picker and submitting -- re-run
        // the same lookup the room-code effect does so the picker reflects
        // reality before they try again.
        if (res.status === 409) {
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
            </div>

            <div>
              <FieldLabel>Your team name</FieldLabel>
              <TextInput
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Thunder XI"
                maxLength={40}
                required
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
          </form>
        </Panel>
      </div>
    </div>
  );
}
