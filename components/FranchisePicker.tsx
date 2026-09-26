"use client";

import Image from "next/image";
import type { Franchise } from "@/lib/types";

// Franchise/flag selection at game creation/setup (iteration 2, confirmed
// placement -- design doc "Franchise identity for teams"). Purely a visual
// skin on top of the participant's own free-text team name, so this is
// optional: a participant can leave it unset and just play with their team
// name alone.
export interface FranchisePickerProps {
  franchises: Franchise[];
  takenFranchiseIds?: Set<string>;
  selectedFranchiseId: string | null;
  onSelect: (franchiseId: string | null) => void;
}

export function FranchisePicker({
  franchises,
  takenFranchiseIds,
  selectedFranchiseId,
  onSelect,
}: FranchisePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {franchises.map((f) => {
        const taken = takenFranchiseIds?.has(f.id) && f.id !== selectedFranchiseId;
        const selected = f.id === selectedFranchiseId;
        return (
          <button
            key={f.id}
            type="button"
            disabled={taken}
            onClick={() => onSelect(selected ? null : f.id)}
            title={taken ? `${f.display_name} -- already taken` : f.display_name}
            className={`group relative aspect-[16/9] overflow-hidden rounded border-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
              selected
                ? "border-gold shadow-[0_0_10px_rgba(201,162,39,0.5)]"
                : "border-silver/20 hover:border-gold/60"
            }`}
          >
            {f.logo_asset_path ? (
              <Image
                src={f.logo_asset_path}
                alt={f.display_name}
                fill
                sizes="120px"
                className="object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-display text-sm font-bold"
                style={{ background: f.primary_color, color: f.secondary_color }}
              >
                {f.abbreviation}
              </div>
            )}
            {selected && (
              <span className="absolute inset-x-0 bottom-0 bg-gold py-0.5 text-center font-body text-[9px] font-bold uppercase tracking-wide text-stock">
                Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
