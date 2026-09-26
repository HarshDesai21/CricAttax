"use client";

import Image from "next/image";
import { Panel } from "@/components/ui";
import { flagAssetPath } from "@/lib/countryFlags";
import { displayName } from "@/lib/playerDisplay";
import { ROLE_BADGE_TEXT } from "@/lib/roleBadge";
import { hexToRgba } from "@/lib/color";
import type { Franchise, Participant, Player, RoundCard } from "@/lib/types";

// A live "who has who" board, standing in for the full Playing XI builder
// (iteration 3). Purely derived from state the page already loads --
// revealed round_cards + the players cache + the participants list -- so it
// needs no new backend work and stays in sync for free via the same
// Realtime subscriptions that already drive the draft board.
//
// Franchise theming (mini-iteration before Playing XI/Trading): a team that
// picked a franchise at lobby time gets its panel background tinted with
// that franchise's real sampled primary color, its team name/role badges in
// the franchise's secondary/accent color, and the real logo shown next to
// the name -- same color language the confirmed Playing XI visual spec
// uses, applied here first since this is the screen people actually look
// at during the draft. A team with no franchise chosen keeps the original
// plain gold/stock look untouched.

export interface SquadTrackerProps {
  participants: Participant[];
  roundCards: RoundCard[];
  players: Map<number, Player>;
  franchises?: Franchise[];
}

interface SquadEntry {
  roundNumber: number;
  player: Player;
}

export function SquadTracker({
  participants,
  roundCards,
  players,
  franchises = [],
}: SquadTrackerProps) {
  const franchiseById = new Map(franchises.map((f) => [f.id, f]));
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
    <div className="w-full max-w-5xl lg:max-w-6xl">
      <p className="mb-2 text-center font-body text-xs uppercase tracking-wide text-silver/50 lg:text-sm">
        Squads so far
      </p>
      {/* flex-wrap + justify-center (instead of a strict grid) is what
          fixes the centering complaint: a grid's fewer-than-a-full-row case
          left panels stuck against the left edge (e.g. 2 teams on a
          3-column desktop layout). Each panel gets a fixed basis instead of
          stretching to fill a grid cell, so 2 teams center as a pair, 3+
          wrap onto new centered rows, and it still degrades to one column
          on a phone. */}
      <div className="flex flex-wrap justify-center gap-3 lg:gap-4">
        {bySeat.map((participant) => {
          const squad = squadByParticipant.get(participant.id) ?? [];
          const franchise = participant.franchise_id
            ? franchiseById.get(participant.franchise_id)
            : null;

          // Franchise panel = the sampled primary color, with a dark
          // overlay baked in via the gradient so player-name text (always
          // plain white/off-white, per the confirmed Playing XI spec) stays
          // readable no matter how light/saturated a given franchise color
          // is (e.g. CSK's yellow).
          const panelStyle = franchise
            ? {
                background: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), ${franchise.primary_color}`,
                borderColor: hexToRgba(franchise.secondary_color, 0.45),
              }
            : undefined;

          return (
            <Panel
              key={participant.id}
              className="!p-3 w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)] lg:!p-4"
              style={panelStyle}
            >
              <div
                className="mb-2 flex items-center gap-2 border-b border-gold/25 pb-1.5 lg:mb-3 lg:pb-2"
                style={
                  franchise
                    ? { borderColor: hexToRgba(franchise.secondary_color, 0.35) }
                    : undefined
                }
              >
                {franchise?.logo_asset_path && (
                  <div className="h-6 w-6 flex-shrink-0 overflow-hidden rounded ring-1 ring-black/30 sm:h-7 sm:w-7 lg:h-8 lg:w-8">
                    <Image
                      src={franchise.logo_asset_path}
                      alt={franchise.display_name}
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <p
                  className="min-w-0 flex-1 truncate font-display text-sm text-gold-light sm:text-base lg:text-lg"
                  style={franchise ? { color: franchise.secondary_color } : undefined}
                >
                  {participant.team_name}
                </p>
                {participant.is_host && (
                  <span className="flex-shrink-0 font-body text-[10px] uppercase tracking-wide text-gold/70 lg:text-xs">
                    Host
                  </span>
                )}
              </div>
              {squad.length === 0 ? (
                <p className="font-body text-xs text-silver/40 lg:text-sm">No picks yet</p>
              ) : (
                <ul className="space-y-1 lg:space-y-1.5">
                  {squad.map(({ player, roundNumber }) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-1.5 rounded bg-black/20 px-1.5 py-1.5 sm:px-2 lg:gap-2 lg:px-2.5 lg:py-2"
                    >
                      <span className="font-body text-[10px] text-silver/40 sm:text-[11px] lg:text-xs">
                        R{roundNumber}
                      </span>
                      <div className="h-3 w-4 flex-shrink-0 overflow-hidden rounded-[2px] sm:h-3.5 sm:w-5 lg:h-4 lg:w-6">
                        <Image
                          src={flagAssetPath(player.country)}
                          alt={player.country}
                          width={16}
                          height={12}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {player.is_overseas && (
                        <div className="h-3 w-3 flex-shrink-0 overflow-hidden rounded-sm opacity-90 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4">
                          <Image
                            src="/cards/plane-icon.jpg"
                            alt="Overseas"
                            width={14}
                            height={14}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <span className="truncate font-body text-xs text-silver sm:text-sm lg:text-base">
                        {displayName(player)}
                      </span>
                      <span
                        className={`ml-auto flex-shrink-0 rounded px-1 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] lg:px-1.5 lg:text-[11px] ${
                          franchise ? "" : "bg-gold/15 text-gold-light"
                        }`}
                        style={
                          franchise
                            ? {
                                backgroundColor: hexToRgba(franchise.secondary_color, 0.2),
                                color: franchise.secondary_color,
                              }
                            : undefined
                        }
                      >
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
