"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heading,
  Panel,
  Button,
  TextInput,
  FieldLabel,
  ErrorText,
} from "@/components/ui";
import { saveSession } from "@/lib/session";

export default function JoinGamePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const code = roomCode.trim().toUpperCase();
    try {
      const res = await fetch(`/api/games/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to join game");
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
