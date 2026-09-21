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

export default function CreateGamePage() {
  const router = useRouter();
  const [numPlayers, setNumPlayers] = useState(4);
  const [hintPurse, setHintPurse] = useState(20);
  const [numRounds, setNumRounds] = useState(25);
  const [hostTeamName, setHostTeamName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numPlayers, hintPurse, numRounds, hostTeamName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create game");
        setSubmitting(false);
        return;
      }
      saveSession(data.roomCode, {
        gameId: data.gameId,
        participantId: data.participantId,
        reconnectToken: data.reconnectToken,
        isHost: true,
      });
      router.push(`/game/${data.roomCode}`);
    } catch {
      setError("Network error -- try again");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <Heading className="mb-6 text-center text-3xl">Create a game</Heading>
        <Panel>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <FieldLabel>Your team name</FieldLabel>
              <TextInput
                value={hostTeamName}
                onChange={(e) => setHostTeamName(e.target.value)}
                placeholder="e.g. Thunder XI"
                maxLength={40}
                required
              />
            </div>

            <div>
              <FieldLabel>Number of players (2-5)</FieldLabel>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setNumPlayers(n)}
                    className={`flex-1 rounded border py-2 font-body font-semibold transition ${
                      numPlayers === n
                        ? "border-gold bg-gold text-stock"
                        : "border-silver/30 text-silver/70 hover:border-gold/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Hint purse per player (credits)</FieldLabel>
              <TextInput
                type="number"
                min={0}
                value={hintPurse}
                onChange={(e) => setHintPurse(Number(e.target.value))}
                required
              />
            </div>

            <div>
              <FieldLabel>Squad size / number of rounds</FieldLabel>
              <TextInput
                type="number"
                min={1}
                max={25}
                value={numRounds}
                onChange={(e) => setNumRounds(Number(e.target.value))}
                required
              />
              <div className="mt-2 flex gap-2">
                {[3, 11, 25].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setNumRounds(n)}
                    className={`rounded border px-3 py-1 font-body text-xs uppercase tracking-wide transition ${
                      numRounds === n
                        ? "border-gold bg-gold text-stock"
                        : "border-silver/30 text-silver/60 hover:border-gold/50"
                    }`}
                  >
                    {n === 25 ? "Full (25)" : `Quick (${n})`}
                  </button>
                ))}
              </div>
              <p className="mt-1 font-body text-xs text-silver/50">
                A real game is 25. Use a smaller number for a quick test draft.
              </p>
            </div>

            <ErrorText>{error}</ErrorText>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating..." : "Create game"}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
