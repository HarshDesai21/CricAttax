"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button, ErrorText, FieldLabel } from "@/components/ui";
import { flagAssetPath } from "@/lib/countryFlags";
import { displayName } from "@/lib/playerDisplay";
import { ROLE_BADGE_TEXT } from "@/lib/roleBadge";
import { squadForParticipant, tradeLockedPlayerIds } from "@/lib/squad";
import type { Franchise, Game, Participant, Player, RoundCard, Trade } from "@/lib/types";

// Trade Hub (design doc "Trade Hub", BUILT this iteration). Starts
// automatically the instant the draft ends -- games.trading_ends_at is set
// by advance-round the moment status flips to 'complete', not by anything
// this component does.
//
// Lives inside a <Modal> (see components/ui.tsx), opened from a button on
// the Playing XI page rather than sitting inline on the page permanently --
// so this component renders its own padding/spacing directly (no outer
// Panel wrapper) and uses a noticeably larger type scale throughout, since
// it now has a spacious modal to itself instead of a squeezed sidebar
// panel.
//
// Three views, per the confirmed spec: trades proposed TO you (with
// accept/decline for anything still pending), trades proposed BY you, and
// one all-trades activity feed. All three are just client-side filters over
// one Realtime-synced `trades` list -- no separate fetch per tab.

export interface TradeHubProps {
  game: Game;
  participants: Participant[];
  players: Map<number, Player>;
  roundCards: RoundCard[];
  franchises: Franchise[];
  trades: Trade[];
  myParticipantId: string | null;
  isHost: boolean;
  onPropose: (
    targetParticipantId: string,
    offeredPlayerId: number,
    requestedPlayerId: number
  ) => Promise<void>;
  onRespond: (tradeId: string, accept: boolean) => Promise<void>;
  onEndTrading: () => Promise<void>;
  proposing: boolean;
  proposeError: string;
  respondingTradeId: string | null;
  endingTrading: boolean;
}

type Tab = "to-you" | "by-you" | "activity";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TradeHub({
  game,
  participants,
  players,
  roundCards,
  franchises,
  trades,
  myParticipantId,
  isHost,
  onPropose,
  onRespond,
  onEndTrading,
  proposing,
  proposeError,
  respondingTradeId,
  endingTrading,
}: TradeHubProps) {
  const franchiseById = new Map(franchises.map((f) => [f.id, f]));
  const participantById = new Map(participants.map((p) => [p.id, p]));

  const tradingEndsAtMs = game.trading_ends_at ? new Date(game.trading_ends_at).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const windowOpen = !!tradingEndsAtMs && !game.trading_ended_early && now < tradingEndsAtMs;
    if (!windowOpen) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradingEndsAtMs, game.trading_ended_early]);

  const windowOpen = !!tradingEndsAtMs && !game.trading_ended_early && now < tradingEndsAtMs;

  const myTrade = trades.filter((t) => t.proposer_participant_id === myParticipantId).length;
  const capRemaining = Math.max(0, game.trade_cap - myTrade);

  const [tab, setTab] = useState<Tab>("to-you");
  const [targetId, setTargetId] = useState("");
  const [offeredId, setOfferedId] = useState("");
  const [requestedId, setRequestedId] = useState("");

  const others = participants.filter((p) => p.id !== myParticipantId);

  const mySquad = useMemo(
    () => (myParticipantId ? squadForParticipant(myParticipantId, roundCards, players) : []),
    [myParticipantId, roundCards, players]
  );
  const myLocked = useMemo(
    () => (myParticipantId ? tradeLockedPlayerIds(myParticipantId, roundCards) : new Set<number>()),
    [myParticipantId, roundCards]
  );
  const myTradableSquad = mySquad.filter((p) => !myLocked.has(p.id));

  const targetSquad = useMemo(
    () => (targetId ? squadForParticipant(targetId, roundCards, players) : []),
    [targetId, roundCards, players]
  );
  const targetLocked = useMemo(
    () => (targetId ? tradeLockedPlayerIds(targetId, roundCards) : new Set<number>()),
    [targetId, roundCards]
  );
  const targetTradableSquad = targetSquad.filter((p) => !targetLocked.has(p.id));

  async function handleProposeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId || !offeredId || !requestedId) return;
    await onPropose(targetId, Number(offeredId), Number(requestedId));
    setOfferedId("");
    setRequestedId("");
  }

  const toYou = trades
    .filter((t) => t.target_participant_id === myParticipantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const byYou = trades
    .filter((t) => t.proposer_participant_id === myParticipantId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const activity = [...trades].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const shown = tab === "to-you" ? toYou : tab === "by-you" ? byYou : activity;

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-2xl text-gold-light sm:text-3xl">Trade Hub</p>
          <p className="font-body text-sm text-silver/50 sm:text-base">
            {windowOpen
              ? `Trading closes in ${formatRemaining(tradingEndsAtMs! - now)}`
              : game.trading_ended_early
                ? "Trading was ended early by the host"
                : tradingEndsAtMs
                  ? "Trading window closed"
                  : "Trading hasn't started for this game"}
          </p>
        </div>
        {isHost && windowOpen && (
          <Button
            type="button"
            variant="secondary"
            disabled={endingTrading}
            onClick={onEndTrading}
            className="!px-4 !py-2 !text-sm"
          >
            {endingTrading ? "Ending..." : "End trading now"}
          </Button>
        )}
      </div>

      {windowOpen && myParticipantId && (
        <form onSubmit={handleProposeSubmit} className="mb-6 rounded-md bg-black/25 p-4 space-y-4">
          <p className="font-body text-sm uppercase tracking-wide text-silver/50">
            Propose a trade -- {capRemaining} of {game.trade_cap} proposals left
          </p>

          <div>
            <FieldLabel>Trade with</FieldLabel>
            <TradeSelect
              value={targetId}
              onChange={(v) => {
                setTargetId(v);
                setRequestedId("");
              }}
              placeholder="Choose a team..."
              options={others.map((p) => ({ value: p.id, label: p.team_name }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Your player</FieldLabel>
              <TradeSelect
                value={offeredId}
                onChange={setOfferedId}
                placeholder={myTradableSquad.length === 0 ? "No tradable players" : "Choose..."}
                options={myTradableSquad.map((p) => ({
                  value: String(p.id),
                  label: displayName(p),
                }))}
              />
            </div>
            <div>
              <FieldLabel>Their player</FieldLabel>
              <TradeSelect
                value={requestedId}
                onChange={setRequestedId}
                disabled={!targetId}
                placeholder={
                  !targetId
                    ? "Pick a team first"
                    : targetTradableSquad.length === 0
                      ? "No tradable players"
                      : "Choose..."
                }
                options={targetTradableSquad.map((p) => ({
                  value: String(p.id),
                  label: displayName(p),
                }))}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={proposing || !targetId || !offeredId || !requestedId || capRemaining <= 0}
            className="w-full !py-3 !text-base"
          >
            {proposing ? "Proposing..." : "Propose trade"}
          </Button>
          <ErrorText>{proposeError}</ErrorText>
        </form>
      )}

      <div className="mb-4 flex gap-1 rounded-md bg-black/20 p-1">
        {(
          [
            ["to-you", `To you (${toYou.filter((t) => t.status === "pending").length})`],
            ["by-you", `By you (${byYou.length})`],
            ["activity", `Activity (${activity.length})`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 rounded px-2 py-2 font-body text-sm font-semibold uppercase tracking-wide transition ${
              tab === id ? "bg-gold text-stock" : "text-silver/60 hover:text-silver"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {shown.length === 0 && (
          <li className="rounded border border-dashed border-silver/20 px-4 py-6 text-center font-body text-sm text-silver/40">
            Nothing here yet.
          </li>
        )}
        {shown.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            proposer={participantById.get(trade.proposer_participant_id)}
            target={participantById.get(trade.target_participant_id)}
            offeredPlayer={players.get(trade.offered_player_id)}
            requestedPlayer={players.get(trade.requested_player_id)}
            franchiseById={franchiseById}
            canRespond={tab === "to-you" && trade.target_participant_id === myParticipantId}
            responding={respondingTradeId === trade.id}
            onRespond={onRespond}
          />
        ))}
      </ul>
    </div>
  );
}

function TradeSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled || options.length === 0}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-silver/30 bg-black/30 px-3 py-2.5 font-body text-base text-silver focus:border-gold focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function TeamChip({
  participant,
  franchise,
}: {
  participant: Participant | undefined;
  franchise: Franchise | null | undefined;
}) {
  if (!participant) return <span className="font-body text-sm text-silver/40">Unknown team</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {franchise?.logo_asset_path && (
        <div className="relative h-5 w-9 max-w-[2.25rem] flex-shrink-0 overflow-hidden rounded-sm ring-1 ring-black/30">
          <Image
            src={franchise.logo_asset_path}
            alt={franchise.display_name}
            fill
            sizes="36px"
            className="object-cover"
          />
        </div>
      )}
      <span
        className="truncate font-display text-base font-semibold sm:text-lg"
        style={franchise ? { color: franchise.secondary_color } : undefined}
      >
        {participant.team_name}
      </span>
    </span>
  );
}

function PlayerChip({ player }: { player: Player | undefined }) {
  if (!player) return <span className="font-body text-sm text-silver/40">Unknown player</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <div className="h-3.5 w-5 flex-shrink-0 overflow-hidden rounded-[2px]">
        <Image
          src={flagAssetPath(player.country)}
          alt={player.country}
          width={20}
          height={14}
          className="h-full w-full object-cover"
        />
      </div>
      <span className="truncate font-body text-sm text-silver sm:text-base">
        {displayName(player)}
      </span>
      <span className="flex-shrink-0 rounded bg-gold/15 px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wide text-gold-light sm:text-xs">
        {ROLE_BADGE_TEXT[player.role]}
      </span>
    </span>
  );
}

const STATUS_LABEL: Record<Trade["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
};

function TradeRow({
  trade,
  proposer,
  target,
  offeredPlayer,
  requestedPlayer,
  franchiseById,
  canRespond,
  responding,
  onRespond,
}: {
  trade: Trade;
  proposer: Participant | undefined;
  target: Participant | undefined;
  offeredPlayer: Player | undefined;
  requestedPlayer: Player | undefined;
  franchiseById: Map<string, Franchise>;
  canRespond: boolean;
  responding: boolean;
  onRespond: (tradeId: string, accept: boolean) => Promise<void>;
}) {
  const proposerFranchise = proposer?.franchise_id ? franchiseById.get(proposer.franchise_id) : null;
  const targetFranchise = target?.franchise_id ? franchiseById.get(target.franchise_id) : null;

  return (
    <li className="rounded-md bg-black/20 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Stacked "Team <-> Team" line above a "Player <-> Player" line,
            per feedback that the old single-line run-together chips
            ("Charlotte Super KingsSuyash SharmaBWLforKL RahulWKfromMumbai
            blasters") were unreadable. Bigger font throughout since this
            now lives in a spacious modal. */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <TeamChip participant={proposer} franchise={proposerFranchise} />
            <span className="font-display text-lg text-silver/40 sm:text-xl">&harr;</span>
            <TeamChip participant={target} franchise={targetFranchise} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PlayerChip player={offeredPlayer} />
            <span className="font-display text-base text-silver/40 sm:text-lg">&harr;</span>
            <PlayerChip player={requestedPlayer} />
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded px-2.5 py-1 font-body text-xs font-semibold uppercase tracking-wide ${
            trade.status === "accepted"
              ? "bg-green-900/40 text-green-300"
              : trade.status === "declined"
                ? "bg-red-900/30 text-red-300"
                : "bg-gold/15 text-gold-light"
          }`}
        >
          {STATUS_LABEL[trade.status]}
        </span>
      </div>
      {canRespond && trade.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            disabled={responding}
            onClick={() => onRespond(trade.id, true)}
            className="!px-4 !py-1.5 !text-sm"
          >
            Accept
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={responding}
            onClick={() => onRespond(trade.id, false)}
            className="!px-4 !py-1.5 !text-sm"
          >
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}
