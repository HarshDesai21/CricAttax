"use client";

import { MysteryCard, REVEAL_STAGGER_MS, type PrivateHint } from "@/components/MysteryCard";
import { HintPanel } from "@/components/HintPanel";
import { Panel, Heading, ErrorText, Button } from "@/components/ui";
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
  isHost: boolean;
  onPick: (slotIndex: number) => void;
  onAdvanceRound: () => void;
  picking: boolean;
  advancing: boolean;
  error: string;
  // Hints (iteration 2) -- all optional so this component still works if a
  // caller doesn't wire hints up. hintsBySlot only ever holds entries for
  // slots THIS browser paid to see -- see HintPanel/MysteryCard for the
  // privacy reasoning.
  hintPurseRemaining?: number;
  hintUsedThisRound?: boolean;
  hintsBySlot?: Map<number, PrivateHint>;
  requestingHint?: boolean;
  hintError?: string;
  onRequestHint?: (tier: number) => void;
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
  isHost,
  onPick,
  onAdvanceRound,
  picking,
  advancing,
  error,
  hintPurseRemaining = 0,
  hintUsedThisRound = false,
  hintsBySlot,
  requestingHint = false,
  hintError = "",
  onRequestHint,
}: DraftBoardProps) {
  const claimedCount = roundCards.filter((c) => c.picked_by_participant_id !== null).length;
  const active = activeParticipantId(pickOrder, claimedCount);
  const isMyTurn = active !== null && active === myParticipantId;

  // A round is "complete" once every slot has actually been revealed (not
  // just claimed) -- this is the state that used to auto-advance and now
  // instead waits for the host to click through, per the design change.
  const roundComplete =
    roundCards.length === numPlayers && roundCards.every((c) => c.status === "picked");
  const isLastRound = currentRound >= numRounds;

  // No hints on the round's last pick -- there's no choice left to inform,
  // the last picker just gets whatever card remains. Mirrors the same
  // check the hint API route enforces server-side.
  const unclaimedCount = numPlayers - claimedCount;
  const canBuyHint = isMyTurn && !roundComplete && unclaimedCount > 1 && !!onRequestHint;

  const slots = Array.from({ length: numPlayers }, (_, i) => i);
  const cardBySlot = new Map(roundCards.map((c) => [c.slot_index, c]));

  // Reveal order follows PICK order, not grid/slot order: rank this round's
  // cards by picked_at ascending, so card A (picked first) flips first, then
  // B, then C, regardless of which slot each one happened to occupy.
  const revealRankBySlot = new Map<number, number>();
  [...roundCards]
    .filter((c) => c.picked_at != null)
    .sort((a, b) => new Date(a.picked_at!).getTime() - new Date(b.picked_at!).getTime())
    .forEach((c, rank) => revealRankBySlot.set(c.slot_index, rank));

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-5 px-2 sm:px-0 lg:max-w-4xl xl:max-w-5xl">
      <div className="text-center">
        <p className="font-body text-xs uppercase tracking-wide text-silver/50 lg:text-sm">
          Round {currentRound} of {numRounds}
        </p>
        <Heading className="mt-1 text-xl sm:text-2xl lg:text-3xl">
          {roundComplete
            ? "Round revealed!"
            : active === null
              ? "Revealing this round..."
              : isMyTurn
                ? "Your turn -- pick a card"
                : `Waiting for ${participantNames.get(active) ?? "the next player"}`}
        </Heading>
      </div>

      {/* Stacked (hint panel above the grid) on mobile/tablet -- there's no
          spare width for a sidebar there. At lg:, flex-row-reverse turns
          this into a side-by-side layout WITHOUT reordering the DOM: the
          grid (second child) lands on the left, the now-vertical HintPanel
          (first child) becomes a right-hand sidebar next to it -- bigger
          and easier to read on a laptop screen, per feedback. */}
      <div className="flex w-full flex-col items-center gap-5 lg:flex-row-reverse lg:items-start lg:justify-center lg:gap-6">
        {canBuyHint && (
          <div className="w-full lg:w-64 lg:flex-shrink-0">
            <HintPanel
              hintPurseRemaining={hintPurseRemaining}
              hintUsedThisRound={hintUsedThisRound}
              requestingHint={requestingHint}
              onRequestHint={(tier) => onRequestHint?.(tier)}
              error={hintError}
            />
          </div>
        )}

        <Panel className="w-full lg:!p-8">
          <div
            className="grid justify-center gap-4 sm:gap-6 lg:gap-8"
            style={{
              // auto-fit + a fixed min/max card width (instead of a fixed
              // column count) is what makes this respond well from a phone
              // screen up to a wide desktop one: it naturally wraps to fewer
              // columns on narrow viewports and more on wide ones, without
              // needing separate breakpoint-specific column counts, and the
              // min/max range is also what gives the extra breathing room
              // between cards that felt too tight before.
              //
              // Widened again (190px -> 260px) per live-playtest feedback
              // that cards STILL read too small on a laptop screen. The min
              // stays at 96px so phones are completely unaffected -- a
              // narrow viewport never has the horizontal room for auto-fit
              // to reach this max anyway; only wide viewports (which do
              // have that room) get noticeably bigger cards.
              gridTemplateColumns: "repeat(auto-fit, minmax(96px, 260px))",
            }}
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
              const rank = revealRankBySlot.get(slotIndex) ?? slotIndex;

              return (
                <MysteryCard
                  key={slotIndex}
                  state={state}
                  player={player}
                  claimedByTeamName={claimedByTeamName}
                  isPickable={isMyTurn && !claimed && !picking}
                  onPick={() => onPick(slotIndex)}
                  revealDelayMs={rank * REVEAL_STAGGER_MS}
                  privateHint={state === "hidden" ? hintsBySlot?.get(slotIndex) ?? null : null}
                />
              );
            })}
          </div>
        </Panel>
      </div>

      {roundComplete &&
        (isHost ? (
          <Button onClick={onAdvanceRound} disabled={advancing} className="w-full sm:w-auto">
            {advancing
              ? "Loading next round..."
              : isLastRound
                ? "Finish draft"
                : "Next round"}
          </Button>
        ) : (
          <p className="font-body text-sm text-silver/60">
            Waiting for the host to start the next round...
          </p>
        ))}

      <ErrorText>{error}</ErrorText>
    </div>
  );
}
