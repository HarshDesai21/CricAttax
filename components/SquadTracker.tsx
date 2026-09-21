"use client";

import Image from "next/image";
import { Panel } from "@/components/ui";
import { flagAssetPath, countryCodeText } from "@/lib/countryFlags";
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bySeat.map((participant) => {
          const squad = squadByParticipant.get(participant.id) ?? [];
          return (
            <Panel key={participant.id} className="!p-3">
              <div className="mb-2 flex items-center justify-between border-b border-gold/25 pb-1.5">
                <p className="truncate font-display text-sm text-gold-light">
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
                      className="flex items-center gap-1.5 rounded bg-black/20 px-1.5 py-1"
                    >
                      <span className="font-body text-[10px] text-silver/40">
                        R{roundNumber}
                      </span>
                      <div className="h-3 w-4 flex-shrink-0 overflow-hidden rounded-[2px]">
                        <Image
                          src={flagAssetPath(player.country)}
                          alt={player.country}
                          width={16}
                          height={12}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="truncate font-body text-xs text-silver">
                        {player.full_name}
                      </span>
                      <span className="ml-auto flex-shrink-0 font-body text-[9px] uppercase tracking-wide text-silver/40">
                        {countryCodeText(player.country)}
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
