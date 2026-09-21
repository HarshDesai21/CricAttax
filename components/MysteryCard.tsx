"use client";

import Image from "next/image";
import type { Player, PlayerRole } from "@/lib/types";
import { flagAssetPath, countryCodeText } from "@/lib/countryFlags";

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

export interface MysteryCardProps {
  state: MysteryCardState;
  player?: Player | null;
  claimedByTeamName?: string | null;
  isPickable?: boolean;
  onPick?: () => void;
  revealDelayMs?: number;
}

export function MysteryCard({
  state,
  player,
  claimedByTeamName,
  isPickable = false,
  onPick,
  revealDelayMs = 0,
}: MysteryCardProps) {
  const flipped = state === "revealed";

  return (
    <button
      type="button"
      onClick={isPickable ? onPick : undefined}
      disabled={!isPickable}
      className={`group relative aspect-[2/3] w-full [perspective:1200px] ${
        isPickable ? "cursor-pointer" : "cursor-default"
      }`}
      aria-label={
        state === "revealed" && player
          ? `${player.full_name}, ${player.role}`
          : state === "claimed"
            ? `Claimed by ${claimedByTeamName ?? "another team"}`
            : "Mystery card"
      }
    >
      <div
        className="relative h-full w-full transition-transform ease-[cubic-bezier(.34,1.4,.4,1)] [transform-style:preserve-3d]"
        style={{
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transitionDuration: "700ms",
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
          {state === "claimed" && claimedByTeamName && (
            <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1.5 text-center">
              <p className="truncate font-body text-[11px] uppercase tracking-wide text-gold-light">
                {claimedByTeamName}
              </p>
            </div>
          )}
          {state === "hidden" && isPickable && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
              <span className="rounded bg-gold px-3 py-1 font-body text-xs font-semibold uppercase tracking-wide text-stock opacity-0 transition group-hover:opacity-100">
                Pick
              </span>
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
              <div className="absolute left-1.5 top-1.5 flex w-8 flex-col items-center">
                <div
                  className="w-full overflow-hidden shadow-sm"
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)" }}
                >
                  <Image
                    src={flagAssetPath(player.country)}
                    alt={player.country}
                    width={32}
                    height={24}
                    className="h-5 w-full object-cover"
                  />
                </div>
                <span className="mt-0.5 font-body text-[9px] font-semibold tracking-wide text-silver">
                  {countryCodeText(player.country)}
                </span>
              </div>

              {/* Top-right: overseas plane icon */}
              {player.is_overseas && (
                <div className="absolute right-1.5 top-1.5 h-4 w-4 opacity-90">
                  <Image src="/cards/plane-icon.svg" alt="Overseas" fill sizes="16px" />
                </div>
              )}

              {/* Center emblem */}
              <div className="relative mt-7 flex flex-1 items-center justify-center px-3">
                <div className="relative h-full w-full">
                  <Image
                    src={ROLE_EMBLEM[player.role]}
                    alt={player.role}
                    fill
                    sizes="200px"
                    className="object-contain"
                  />
                </div>
              </div>

              {/* Bottom name/stat plate */}
              <div className="rounded bg-black/50 px-1.5 py-1 text-center">
                <p className="truncate font-display text-[11px] font-semibold text-gold-light">
                  {player.full_name}
                </p>
                <p className="font-body text-[9px] uppercase tracking-wide text-silver/70">
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
  );
}
