"use client";

import { MysteryCard } from "@/components/MysteryCard";
import { Panel, Heading, ErrorText } from "@/components/ui";
import { activeParticipantId } from "@/lib/draft";
import type { Player, RoundCard } from "@/lib/types";

export interface DraftBoardProps {
  roundCards: RoundCard[];
  numPlayers: number;
  numRounds: number;
  currentRound: number;
  pickOrder: string[];
  players: Map<number, Player>;
  participantNames: Map<string, string>;
  myParticipantId: string | null;
  onPick: (slotIndex: number) => void;
  picking: boolean;
  error: string;
}

export function DraftBoard({
  roundCards,
  numPlayers,
  numRounds,
  currentRound,
  pickOrder,
  players,
  participantNames,
  myParticipantId,
  onPick,
  picking,
  error,
}: DraftBoardProps) {
  const claimedCount = roundCards.filter((c) => c.picked_by_participant_id !== null).length;
  const active = activeParticipantId(pickOrder, claimedCount);
  const isMyTurn = active !== null && active === myParticipantId;

  const slots = Array.from({ length: numPlayers }, (_, i) => i);
  const cardBySlot = new Map(roundCards.map((c) => [c.slot_index, c]));

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5">
      <div className="text-center">
        <p className="font-body text-xs uppercase tracking-wide text-silver/50">
          Round {currentRound} of {numRounds}
        </p>
        <Heading className="mt-1 text-xl">
          {active === null
            ? "Revealing this round..."
            : isMyTurn
              ? "Your turn -- pick a card"
              : `Waiting for ${participantNames.get(active) ?? "the next player"}`}
        </Heading>
      </div>

      <Panel className="w-full">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(numPlayers, 5)}, minmax(0, 1fr))` }}
        >
          {slots.map((slotIndex) => {
            const card = cardBySlot.get(slotIndex);
            const claimed = !!card?.picked_by_participant_id;
            const revealed = card?.status === "picked" && card.player_id != null;
            const state = revealed ? "revealed" : claimed ? "claimed" : "hidden";
            const player = revealed && card?.player_id != null ? players.get(card.player_id) : null;
            const claimedByTeamName = card?.picked_by_participant_id
              ? participantNames.get(card.picked_by_participant_id)
              : null;

            return (
              <MysteryCard
                key={slotIndex}
                state={state}
                player={player}
                claimedByTeamName={claimedByTeamName}
                isPickable={isMyTurn && !claimed && !picking}
                onPick={() => onPick(slotIndex)}
                revealDelayMs={slotIndex * 120}
              />
            );
          })}
        </div>
      </Panel>

      <ErrorText>{error}</ErrorText>
    </div>
  );
}
