"use client";

import Image from "next/image";
import { Panel } from "@/components/ui";
import { flagAssetPath } from "@/lib/countryFlags";
import { displayName } from "@/lib/playerDisplay";
import { ROLE_BADGE_TEXT } from "@/lib/roleBadge";
import type { Participant, Player, RoundCard } from "@/lib/types";

// A live "who has who" board, standing in for the full Playing XI builder
// (iteration 3). Purely derived from state the page already loads --
// revealed round_cards + the players cache + the participants list -- so it
// needs no new backend work and stays in sync for free via the same
// Realtime subscriptions that already drive the draft board.

export interface SquadTrackerProps {
  participants: Participant[];
  roundCards: RoundCard[];
  players: Map<number, Player>;
}

interface SquadEntry {
  roundNumber: number;
  player: Player;
}

export function SquadTracker({ participants, roundCards, players }: SquadTrackerProps) {
  const bySeat = [...participants].sort((a, b) => a.seat_number - b.seat_number);

  const squadByParticipant = new Map<string, SquadEntry[]>();
  for (const card of roundCards) {
    if (!card.picked_by_participant_id || card.status !== "picked" || card.player_id == null) {
      continue;
    }
    const player = players.get(card.player_id);
    if (!player) continue;
    const list = squadByParticipant.get(card.picked_by_participant_id) ?? [];
    list.push({ roundNumber: card.round_number, player });
    squadByParticipant.set(card.picked_by_participant_id, list);
  }
  for (const list of squadByParticipant.values()) {
    list.sort((a, b) => a.roundNumber - b.roundNumber);
  }

  if (participants.length === 0) return null;

  return (
    <div className="w-full max-w-5xl">
      <p className="mb-2 text-center font-body text-xs uppercase tracking-wide text-silver/50">
        Squads so far
      </p>
      {/* flex-wrap + justify-center (instead of a strict grid) is what
          fixes the centering complaint: a grid's fewer-than-a-full-row case
          left panels stuck against the left edge (e.g. 2 teams on a
          3-column desktop layout). Each panel gets a fixed basis instead of
          stretching to fill a grid cell, so 2 teams center as a pair, 3+
          wrap onto new centered rows, and it still degrades to one column
          on a phone. */}
      <div className="flex flex-wrap justify-center gap-3">
        {bySeat.map((participant) => {
          const squad = squadByParticipant.get(participant.id) ?? [];
          return (
            <Panel
              key={participant.id}
              className="!p-3 w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]"
            >
              <div className="mb-2 flex items-center justify-between border-b border-gold/25 pb-1.5">
                <p className="truncate font-display text-sm sm:text-base text-gold-light">
                  {participant.team_name}
                </p>
                {participant.is_host && (
                  <span className="font-body text-[10px] uppercase tracking-wide text-gold/70">
                    Host
                  </span>
                )}
              </div>
              {squad.length === 0 ? (
                <p className="font-body text-xs text-silver/40">No picks yet</p>
              ) : (
                <ul className="space-y-1">
                  {squad.map(({ player, roundNumber }) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-1.5 rounded bg-black/20 px-1.5 py-1.5 sm:px-2"
                    >
                      <span className="font-body text-[10px] sm:text-[11px] text-silver/40">
                        R{roundNumber}
                      </span>
                      <div className="h-3 w-4 flex-shrink-0 overflow-hidden rounded-[2px] sm:h-3.5 sm:w-5">
                        <Image
                          src={flagAssetPath(player.country)}
                          alt={player.country}
                          width={16}
                          height={12}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {player.is_overseas && (
                        <div className="h-3 w-3 flex-shrink-0 overflow-hidden rounded-sm opacity-90 sm:h-3.5 sm:w-3.5">
                          <Image
                            src="/cards/plane-icon.jpg"
                            alt="Overseas"
                            width={14}
                            height={14}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <span className="truncate font-body text-xs sm:text-sm text-silver">
                        {displayName(player)}
                      </span>
                      <span className="ml-auto flex-shrink-0 rounded bg-gold/15 px-1 py-0.5 font-body text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-gold-light">
                        {ROLE_BADGE_TEXT[player.role]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
