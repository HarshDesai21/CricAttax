"use client";

import { Button, ErrorText } from "@/components/ui";

// One committed tier, paid for once per round -- see design doc "Hints
// (confirmed mechanic)". This panel only ever appears for the active
// picker, and only before the round's last pick (the last picker gets
// whatever's left automatically, so there's nothing to hint about).
const TIERS = [
  { tier: 1, cost: 1, label: "Country" },
  { tier: 2, cost: 2, label: "+ Role" },
  { tier: 3, cost: 3, label: "+ Averages" },
  { tier: 4, cost: 4, label: "+ Full name" },
] as const;

export interface HintPanelProps {
  hintPurseRemaining: number;
  hintUsedThisRound: boolean;
  requestingHint: boolean;
  onRequestHint: (tier: number) => void;
  error: string;
}

export function HintPanel({
  hintPurseRemaining,
  hintUsedThisRound,
  requestingHint,
  onRequestHint,
  error,
}: HintPanelProps) {
  return (
    <div className="w-full max-w-2xl rounded-lg border border-gold/25 bg-black/20 p-3 text-center lg:max-w-none lg:p-5">
      <p className="mb-2 font-body text-sm uppercase tracking-wide text-silver/50 lg:mb-3 lg:text-base">
        {hintUsedThisRound
          ? "Hint used this round"
          : `Buy a hint this round -- ${hintPurseRemaining}cr left`}
      </p>
      {!hintUsedThisRound && (
        // Horizontal wrap on mobile/tablet (there's no room to spare
        // vertically there); switches to a bigger, vertical stack of
        // buttons at lg: per feedback that the tier choices read too small
        // and cramped on a laptop screen -- bumped again per a second round
        // of the same feedback (the earlier lg: bump wasn't enough).
        <div className="flex flex-wrap justify-center gap-2 lg:flex-col lg:items-stretch lg:gap-3">
          {TIERS.map(({ tier, cost, label }) => (
            <Button
              key={tier}
              type="button"
              variant="secondary"
              disabled={requestingHint || hintPurseRemaining < cost}
              onClick={() => onRequestHint(tier)}
              className="!px-4 !py-2 !text-sm lg:!px-6 lg:!py-4 lg:!text-lg"
            >
              {cost}cr &middot; {label}
            </Button>
          ))}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
