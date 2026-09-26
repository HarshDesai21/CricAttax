"use client";

import Image from "next/image";
import type { Player, PlayerRole } from "@/lib/types";
import { flagAssetPath, countryCodeText } from "@/lib/countryFlags";
import { displayName } from "@/lib/playerDisplay";

// The locked card layout from the design doc: top-left flag + country code,
// top-right plane icon (overseas only), center role emblem, bottom name/
// stat plate -- all on the black/gold/silver frame. This component renders
// both faces and does the 3D flip itself; callers just change `state`.

const ROLE_EMBLEM: Record<PlayerRole, string> = {
  Batter: "/cards/emblem-batter.jpg",
  Bowler: "/cards/emblem-bowler.jpg",
  "All-Rounder": "/cards/emblem-allrounder.jpg",
  "WK-Batter": "/cards/emblem-wicketkeeper.jpg",
};

export type MysteryCardState = "hidden" | "claimed" | "revealed";

// What a paid hint reveals about a still-hidden card -- private to whichever
// browser actually paid for it (see the hint API route: this data is only
// ever returned in that participant's own response, never broadcast via
// Realtime), so there's no server-side "masking" concern here the way there
// is for the real reveal -- a parent only ever hands this prop to its own
// player's view of the board.
export interface PrivateHint {
  country: string;
  role?: PlayerRole;
  battingAvg?: number | null;
  bowlingAvg?: number | null;
  name?: string;
}

export interface MysteryCardProps {
  state: MysteryCardState;
  player?: Player | null;
  claimedByTeamName?: string | null;
  isPickable?: boolean;
  onPick?: () => void;
  revealDelayMs?: number;
  privateHint?: PrivateHint | null;
}

// Flip timing, tuned per feedback that the original 700ms/120ms-stagger felt
// too fast to read -- especially with several cards revealing at once, the
// old pace made it look like the reveal "skipped" rather than played out.
// Both live here so DraftBoard and MysteryCard agree on one number.
export const FLIP_DURATION_MS = 1400;
export const REVEAL_STAGGER_MS = 550;

export function MysteryCard({
  state,
  player,
  claimedByTeamName,
  isPickable = false,
  onPick,
  revealDelayMs = 0,
  privateHint = null,
}: MysteryCardProps) {
  const flipped = state === "revealed";

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      {/* Team-name label lives ABOVE the card, not on it -- the card face
          itself (front or back) never carries any team-name text. */}
      <div className="flex h-4 w-full items-center justify-center lg:h-6">
        {claimedByTeamName && (
          <p className="truncate font-body text-[11px] font-semibold uppercase tracking-wide text-gold-light lg:text-sm">
            {claimedByTeamName}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={isPickable ? onPick : undefined}
        disabled={!isPickable}
        className={`group relative aspect-[2/3] w-full [perspective:1200px] ${
          isPickable ? "cursor-pointer" : "cursor-default"
        }`}
        aria-label={
          state === "revealed" && player
            ? `${displayName(player)}, ${player.role}`
            : state === "claimed"
              ? `Claimed by ${claimedByTeamName ?? "another team"}`
              : "Mystery card"
        }
      >
      <div
        className="relative h-full w-full transition-transform ease-[cubic-bezier(.34,1.15,.4,1)] [transform-style:preserve-3d]"
        style={{
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transitionDuration: `${FLIP_DURATION_MS}ms`,
          transitionDelay: flipped ? `${revealDelayMs}ms` : "0ms",
        }}
      >
        {/* BACK FACE -- shown while hidden or claimed-but-unrevealed */}
        <div
          className={`absolute inset-0 overflow-hidden rounded-lg border-2 [backface-visibility:hidden] ${
            state === "claimed"
              ? "border-gold shadow-[0_0_14px_rgba(201,162,39,0.55)]"
              : "border-gold/40"
          } ${isPickable ? "transition-transform group-hover:-translate-y-1 group-hover:scale-[1.02]" : ""}`}
        >
          <Image
            src="/cards/card-back.jpg"
            alt=""
            fill
            sizes="200px"
            className="object-cover"
          />
          {state === "hidden" && isPickable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
              <span className="rounded bg-gold px-3 py-1 font-body text-xs font-semibold uppercase tracking-wide text-stock opacity-0 transition group-hover:opacity-100">
                Pick
              </span>
            </div>
          )}

          {/* Private hint overlay -- only ever rendered from data that came
              back to THIS browser's own hint purchase, so it's naturally
              private without any extra masking here: nobody else's card
              ever receives a privateHint prop for this slot. Text is bumped
              noticeably at lg: -- per feedback, this overlay especially
              needs to stay readable once someone's actually paid for it. */}
          {state === "hidden" && privateHint && (
            <div className="absolute inset-x-1 bottom-1 rounded bg-black/70 px-1.5 py-1 text-center ring-1 ring-gold/50 lg:inset-x-2 lg:bottom-2 lg:rounded-md lg:px-2.5 lg:py-2">
              <div className="flex items-center justify-center gap-1 lg:gap-1.5">
                <div className="h-2.5 w-3.5 flex-shrink-0 overflow-hidden rounded-[2px] lg:h-4 lg:w-5">
                  <Image
                    src={flagAssetPath(privateHint.country)}
                    alt={privateHint.country}
                    width={14}
                    height={10}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="font-body text-[8px] font-semibold tracking-wide text-gold-light lg:text-xs">
                  {countryCodeText(privateHint.country)}
                  {privateHint.role ? ` · ${privateHint.role}` : ""}
                </span>
              </div>
              {(privateHint.battingAvg != null || privateHint.bowlingAvg != null) && (
                <p className="font-body text-[8px] text-silver/70 lg:text-[11px]">
                  {privateHint.battingAvg != null ? `Bat ${privateHint.battingAvg}` : ""}
                  {privateHint.battingAvg != null && privateHint.bowlingAvg != null ? " · " : ""}
                  {privateHint.bowlingAvg != null ? `Bowl ${privateHint.bowlingAvg}` : ""}
                </p>
              )}
              {privateHint.name && (
                <p className="truncate font-display text-[9px] font-semibold text-gold-light lg:text-sm">
                  {privateHint.name}
                </p>
              )}
            </div>
          )}
        </div>

        {/* FRONT FACE -- only meaningful once revealed */}
        <div
          className="absolute inset-0 overflow-hidden rounded-lg border-2 border-gold bg-stock [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          {player && (
            <div className="relative flex h-full w-full flex-col p-2">
              {/* Top-left: flag banner + country code */}
              <div className="absolute left-1.5 top-1.5 flex w-8 flex-col items-center lg:left-2.5 lg:top-2.5 lg:w-11">
                <div
                  className="w-full overflow-hidden shadow-sm"
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)" }}
                >
                  <Image
                    src={flagAssetPath(player.country)}
                    alt={player.country}
                    width={32}
                    height={24}
                    className="h-5 w-full object-cover lg:h-7"
                  />
                </div>
                <span className="mt-0.5 font-body text-[9px] font-semibold tracking-wide text-silver lg:text-xs">
                  {countryCodeText(player.country)}
                </span>
              </div>

              {/* Top-right: overseas plane icon */}
              {player.is_overseas && (
                <div className="absolute right-1.5 top-1.5 h-4 w-4 overflow-hidden rounded-sm opacity-90 lg:right-2.5 lg:top-2.5 lg:h-6 lg:w-6">
                  <Image
                    src="/cards/plane-icon.jpg"
                    alt="Overseas"
                    fill
                    sizes="24px"
                    className="object-cover"
                  />
                </div>
              )}

              {/* Center emblem */}
              <div className="relative mt-7 flex flex-1 items-center justify-center px-3 lg:mt-10 lg:px-5">
                <div className="relative h-full w-full">
                  <Image
                    src={ROLE_EMBLEM[player.role]}
                    alt={player.role}
                    fill
                    sizes="260px"
                    className="object-contain"
                  />
                </div>
              </div>

              {/* Bottom name/stat plate */}
              <div className="rounded bg-black/50 px-1.5 py-1 text-center lg:rounded-md lg:px-2.5 lg:py-2">
                <p className="truncate font-display text-[11px] font-semibold text-gold-light lg:text-base">
                  {displayName(player)}
                </p>
                <p className="font-body text-[9px] uppercase tracking-wide text-silver/70 lg:text-xs">
                  {player.role}
                  {player.role !== "Bowler" && player.batting_avg != null
                    ? ` · Bat ${player.batting_avg}`
                    : ""}
                  {(player.role === "Bowler" || player.role === "All-Rounder") &&
                  player.bowling_avg != null
                    ? ` · Bowl ${player.bowling_avg}`
                    : ""}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      </button>
    </div>
  );
}
