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
// picked a franchise at lobby time gets its panel background in that
// franchise's real, vivid brand color, its team name/role badges in a
// contrasting accent color, and the real logo shown next to the name --
// same color language the confirmed Playing XI visual spec uses, applied
// here first since this is the screen people actually look at during the
// draft. A team with no franchise chosen keeps the original plain gold/
// stock look untouched.
//
// v2 (live-playtest correction): the first version blended a 55% black
// overlay into the panel background so text would stay legible regardless
// of how bright a franchise's color was -- but that overlay is exactly what
// made every color read as a dull, muddy version of itself (CSK's vivid
// yellow came out looking like a dark olive). The header now uses the
// FULL, un-darkened primary_color -- see supabase/schema.sql for the new
// color pairs, chosen so secondary_color is already a strong-contrast
// partner for that specific primary rather than relying on a blanket
// darkening trick. The roster list below the header still gets its own
// neutral dark backing (a sub-panel, plus each row's own chip) so it reads
// fine no matter how bright the header color is.

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

          // Full, un-darkened primary color -- see the note above.
          const panelStyle = franchise
            ? {
                backgroundColor: franchise.primary_color,
                borderColor: hexToRgba(franchise.secondary_color, 0.6),
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
                    ? { borderColor: hexToRgba(franchise.secondary_color, 0.45) }
                    : undefined
                }
              >
                {franchise?.logo_asset_path && (
                  // Real aspect ratio (16:9, matching the source card crop
                  // and how FranchisePicker itself renders it), not a tiny
                  // 1:1 square -- forcing a wide logo into a square with
                  // object-cover was center-cropping it AND asking Next
                  // Image for far fewer pixels than the display size,
                  // which together is what read as "blurry" vs. the
                  // franchise picker on the create/join pages.
                  <div className="relative h-7 w-[3.11rem] flex-shrink-0 overflow-hidden rounded ring-1 ring-black/30 sm:h-8 sm:w-[3.56rem] lg:h-9 lg:w-16">
                    <Image
                      src={franchise.logo_asset_path}
                      alt={franchise.display_name}
                      fill
                      sizes="72px"
                      className="object-cover"
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
                  <span className="flex-shrink-0 rounded bg-black/35 px-1.5 py-0.5 font-body text-[10px] uppercase tracking-wide text-gold-light lg:text-xs">
                    Host
                  </span>
                )}
              </div>
              {/* Roster gets its own neutral dark backing, independent of
                  the header's (now full-brightness) franchise color, so
                  this text is always legible regardless of how light a
                  given team's color is. */}
              <div className={franchise ? "rounded-md bg-black/35 p-1.5 lg:p-2" : ""}>
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
                                  backgroundColor: hexToRgba(franchise.secondary_color, 0.25),
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
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
