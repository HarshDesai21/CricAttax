"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Panel, ErrorText } from "@/components/ui";
import { flagAssetPath } from "@/lib/countryFlags";
import { displayName } from "@/lib/playerDisplay";
import { ROLE_BADGE_TEXT } from "@/lib/roleBadge";
import { hexToRgba } from "@/lib/color";
import { squadForParticipant } from "@/lib/squad";
import type { Franchise, Participant, PlayingXiEntry, Player, RoundCard } from "@/lib/types";

// Playing XI (design doc "Playing XI + Trading (iteration 3)"), pulled
// forward into its own mini-iteration ahead of Trading -- no trade-lock or
// trade-triggered auto-fill logic here yet, since there's no trading to
// trigger it. What IS built: the confirmed 1-11 + Subs layout, drag-and-drop
// between them (touch-friendly, per the design doc's explicit note that the
// plain HTML5 drag API "barely works on phones"), the confirmed franchise
// color treatment, and the max-4-overseas-in-XI cap.
//
// Every participant's arrangement is public within the game (same as
// SquadTracker) -- only the OWNING participant's panel is interactive here;
// everyone else's renders read-only in the identical visual style.

const MAX_XI_SIZE = 11;
const MAX_OVERSEAS_IN_XI = 4;
type ContainerId = "xi" | "subs";

// A cheap, stable fingerprint of an {xi, subs} arrangement, used to tell
// "the server's data actually changed" apart from "this component just
// re-rendered" -- see the lastSyncedSignature ref below.
function signature(lists: { xi: number[]; subs: number[] }): string {
  return `${lists.xi.join(",")}|${lists.subs.join(",")}`;
}

export interface PlayingXIBoardProps {
  participants: Participant[];
  roundCards: RoundCard[];
  players: Map<number, Player>;
  franchises: Franchise[];
  playingXi: PlayingXiEntry[];
  myParticipantId: string | null;
  onSaveMine: (xi: number[], subs: number[]) => void;
  saveError?: string;
}

export function PlayingXIBoard({
  participants,
  roundCards,
  players,
  franchises,
  playingXi,
  myParticipantId,
  onSaveMine,
  saveError = "",
}: PlayingXIBoardProps) {
  const franchiseById = new Map(franchises.map((f) => [f.id, f]));
  const bySeat = [...participants].sort((a, b) => a.seat_number - b.seat_number);

  return (
    <div className="w-full max-w-5xl lg:max-w-6xl">
      <div className="mb-3 text-center">
        <p className="font-body text-xs uppercase tracking-wide text-silver/50 lg:text-sm">
          Playing XI
        </p>
        <p className="mt-0.5 font-body text-[11px] text-silver/40 lg:text-xs">
          Drag your own squad between XI and Subs -- everyone can see everyone&apos;s lineup.
        </p>
      </div>
      <ErrorText>{saveError}</ErrorText>
      <div className="mt-2 flex flex-wrap justify-center gap-4 lg:gap-5">
        {bySeat.map((participant) => {
          const squad = squadForParticipant(participant.id, roundCards, players);
          const franchise = participant.franchise_id
            ? franchiseById.get(participant.franchise_id)
            : null;
          const entries = playingXi.filter((e) => e.participant_id === participant.id);
          const isMine = participant.id === myParticipantId;

          return (
            <TeamPanel
              key={participant.id}
              participant={participant}
              franchise={franchise}
              squad={squad}
              entries={entries}
              editable={isMine}
              onSave={isMine ? onSaveMine : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function TeamPanel({
  participant,
  franchise,
  squad,
  entries,
  editable,
  onSave,
}: {
  participant: Participant;
  franchise: Franchise | null | undefined;
  squad: Player[];
  entries: PlayingXiEntry[];
  editable: boolean;
  onSave?: (xi: number[], subs: number[]) => void;
}) {
  const squadById = new Map(squad.map((p) => [p.id, p]));

  const initial = (): { xi: number[]; subs: number[] } => {
    if (entries.length > 0) {
      const xi = entries
        .filter((e) => e.slot_type === "xi")
        .sort((a, b) => a.position - b.position)
        .map((e) => e.player_id)
        .filter((id) => squadById.has(id));
      const subs = entries
        .filter((e) => e.slot_type === "subs")
        .sort((a, b) => a.position - b.position)
        .map((e) => e.player_id)
        .filter((id) => squadById.has(id));
      // Anything in the squad but missing from the saved rows (shouldn't
      // normally happen -- the save endpoint requires full coverage) falls
      // back into Subs rather than silently disappearing.
      const covered = new Set([...xi, ...subs]);
      const stray = squad.map((p) => p.id).filter((id) => !covered.has(id));
      return { xi, subs: [...subs, ...stray] };
    }
    // No saved arrangement yet -- default to first 11 drafted (round order)
    // in the XI, everyone else in Subs.
    const ids = squad.map((p) => p.id);
    return { xi: ids.slice(0, MAX_XI_SIZE), subs: ids.slice(MAX_XI_SIZE) };
  };

  const [lists, setLists] = useState(initial);
  const [dragError, setDragError] = useState("");
  const seededDefault = useRef(false);
  // Bug fix (live-playtest report): `lists` used to only ever get its value
  // from useState's one-time initializer, so once a panel had mounted it
  // never picked up later changes to `entries`/`squad` -- meaning nobody
  // (including the person who'd just accepted a trade or dragged their own
  // player) saw a squad change reflected without a full page reload. This
  // ref tracks the signature of whatever `lists` we last derived from
  // server data (entries/squad), so the effect below can tell "the server
  // state actually changed" apart from "this component just re-rendered for
  // an unrelated reason" and resync only when it needs to.
  const lastSyncedSignature = useRef(signature(initial()));

  useEffect(() => {
    const computed = initial();
    const sig = signature(computed);
    if (sig !== lastSyncedSignature.current) {
      lastSyncedSignature.current = sig;
      setLists(computed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, squad]);

  // If this participant had no saved rows at all, persist the computed
  // default once so it's visible to everyone else too, not just locally.
  useEffect(() => {
    if (!editable || !onSave || seededDefault.current) return;
    if (entries.length === 0 && squad.length > 0) {
      seededDefault.current = true;
      onSave(lists.xi, lists.subs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, entries.length, squad.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  function findContainer(id: number | string): ContainerId | undefined {
    if (id === "xi" || id === "subs") return id;
    if (lists.xi.includes(Number(id))) return "xi";
    if (lists.subs.includes(Number(id))) return "subs";
    return undefined;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(active.id);
    const overContainer = findContainer(over.id);
    if (!activeContainer || !overContainer) return;
    const activeId = Number(active.id);

    if (activeContainer === overContainer) {
      const items = lists[activeContainer];
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(Number(over.id));
      if (newIndex === -1 || oldIndex === newIndex) return;
      const next = { ...lists, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
      setLists(next);
      lastSyncedSignature.current = signature(next);
      setDragError("");
      onSave?.(next.xi, next.subs);
      return;
    }

    const sourceItems = lists[activeContainer].filter((id) => id !== activeId);
    const destItems = lists[overContainer];
    const overIndex = destItems.indexOf(Number(over.id));
    const insertAt = overIndex === -1 ? destItems.length : overIndex;
    const newDestItems = [...destItems.slice(0, insertAt), activeId, ...destItems.slice(insertAt)];

    if (overContainer === "xi") {
      if (newDestItems.length > MAX_XI_SIZE) {
        setDragError(`Playing XI can only hold ${MAX_XI_SIZE} players`);
        return;
      }
      const overseasCount = newDestItems.filter((id) => squadById.get(id)?.is_overseas).length;
      if (overseasCount > MAX_OVERSEAS_IN_XI) {
        setDragError(`A Playing XI can have at most ${MAX_OVERSEAS_IN_XI} overseas players`);
        return;
      }
    }

    setDragError("");
    const next = { ...lists, [activeContainer]: sourceItems, [overContainer]: newDestItems };
    setLists(next);
    lastSyncedSignature.current = signature(next);
    onSave?.(next.xi, next.subs);
  }

  const accent = franchise?.secondary_color;
  // Full, un-darkened primary color -- a black overlay here was the main
  // reason franchise colors read as muddy/desaturated rather than vibrant
  // (see supabase/schema.sql's color-v2 note and SquadTracker.tsx's same
  // fix). The XI/Subs lists below get their own neutral dark sub-panel
  // instead, so legibility doesn't depend on darkening the header color.
  const panelStyle = franchise
    ? {
        backgroundColor: franchise.primary_color,
        borderColor: hexToRgba(franchise.secondary_color, 0.6),
      }
    : undefined;

  const body = (
    <Panel
      className="!p-3 w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] lg:!p-4"
      style={panelStyle}
    >
      {/* Header: logo + team name (franchise secondary color), no
          subtitle -- per the confirmed visual spec. */}
      <div
        className="mb-2 flex items-center gap-2 border-b border-gold/25 pb-1.5 lg:mb-3 lg:pb-2"
        style={franchise ? { borderColor: hexToRgba(franchise.secondary_color, 0.45) } : undefined}
      >
        {franchise?.logo_asset_path && (
          // Real 16:9 aspect (matching the source crop and how
          // FranchisePicker itself renders the same file), not a tiny 1:1
          // square -- see SquadTracker.tsx for why that read as blurry.
          <div className="relative h-8 w-[3.56rem] flex-shrink-0 overflow-hidden rounded ring-1 ring-black/30 sm:h-9 sm:w-16 lg:h-10 lg:w-[4.44rem]">
            <Image
              src={franchise.logo_asset_path}
              alt={franchise.display_name}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        )}
        <p
          className="min-w-0 flex-1 truncate font-display text-sm text-gold-light sm:text-base lg:text-lg"
          style={accent ? { color: accent } : undefined}
        >
          {participant.team_name}
        </p>
        {editable && (
          <span className="flex-shrink-0 rounded bg-black/35 px-1.5 py-0.5 font-body text-[9px] uppercase tracking-wide text-gold-light lg:text-[11px]">
            Drag to arrange
          </span>
        )}
      </div>

      {/* Neutral dark sub-panel for the roster itself, independent of the
          (now full-brightness) header color above -- see the panelStyle
          comment. */}
      <div className={franchise ? "rounded-md bg-black/35 p-1.5 lg:p-2" : ""}>
        <p className="mb-1 font-body text-[10px] font-semibold uppercase tracking-wide text-silver/50 lg:text-xs">
          Playing XI ({lists.xi.length}/{MAX_XI_SIZE})
        </p>
        <PlayerList
          containerId="xi"
          playerIds={lists.xi}
          squadById={squadById}
          editable={editable}
          accent={accent}
          variant="xi"
        />

        <p className="mb-1 mt-3 font-body text-[10px] font-semibold uppercase tracking-wide text-silver/50 lg:text-xs">
          Subs
        </p>
        <PlayerList
          containerId="subs"
          playerIds={lists.subs}
          squadById={squadById}
          editable={editable}
          accent={accent}
          variant="subs"
        />
      </div>

      <ErrorText>{dragError}</ErrorText>
    </Panel>
  );

  if (!editable) return body;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {body}
    </DndContext>
  );
}

function PlayerList({
  containerId,
  playerIds,
  squadById,
  editable,
  accent,
  variant,
}: {
  containerId: ContainerId;
  playerIds: number[];
  squadById: Map<number, Player>;
  editable: boolean;
  accent: string | undefined;
  variant: "xi" | "subs";
}) {
  const { setNodeRef } = useDroppable({ id: containerId });
  const minHeightClass = playerIds.length === 0 ? "min-h-[2.25rem]" : "";

  const rows = playerIds.map((id, index) => {
    const player = squadById.get(id);
    if (!player) return null;
    return (
      <PlayerRow
        key={id}
        player={player}
        jerseyNumber={variant === "xi" ? index + 1 : null}
        editable={editable}
        accent={accent}
        dimmed={variant === "subs"}
      />
    );
  });

  if (editable) {
    return (
      <SortableContext items={playerIds} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={`space-y-1 rounded ${minHeightClass}`}>
          {rows.length === 0 && (
            <li className="rounded border border-dashed border-silver/20 px-2 py-2 text-center font-body text-[10px] text-silver/30">
              Drop here
            </li>
          )}
          {rows}
        </ul>
      </SortableContext>
    );
  }

  return <ul className={`space-y-1 rounded ${minHeightClass}`}>{rows}</ul>;
}

function PlayerRow({
  player,
  jerseyNumber,
  editable,
  accent,
  dimmed,
}: {
  player: Player;
  jerseyNumber: number | null;
  editable: boolean;
  accent: string | undefined;
  dimmed: boolean;
}) {
  const sortable = useSortable({ id: player.id, disabled: !editable });
  const style = editable
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }
    : undefined;

  return (
    <li
      ref={editable ? sortable.setNodeRef : undefined}
      style={style}
      className={`flex items-center gap-1.5 rounded px-1.5 py-1.5 sm:px-2 lg:gap-2 lg:px-2.5 lg:py-2 ${
        dimmed ? "border border-dashed border-silver/20 bg-black/10 opacity-80" : "bg-black/25"
      } ${sortable.isDragging ? "opacity-40" : ""}`}
    >
      {editable && (
        <button
          type="button"
          className="flex-shrink-0 cursor-grab touch-none px-0.5 text-silver/40 active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          ⠿
        </button>
      )}
      {jerseyNumber != null && (
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border font-body text-[10px] font-semibold lg:h-6 lg:w-6 lg:text-xs"
          style={{ borderColor: accent ?? "#c9a227", color: accent ?? "#f2d879" }}
        >
          {jerseyNumber}
        </span>
      )}
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
        className="ml-auto flex-shrink-0 rounded px-1 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] lg:px-1.5 lg:text-[11px]"
        style={{
          backgroundColor: hexToRgba(accent ?? "#c9a227", 0.2),
          color: accent ?? "#f2d879",
        }}
      >
        {ROLE_BADGE_TEXT[player.role]}
      </span>
    </li>
  );
}
