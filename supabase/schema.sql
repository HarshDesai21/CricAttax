-- Cricattax database schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / OR REPLACE where possible.

-- =========================================================================
-- Reference data (public, read-only from the client)
-- =========================================================================

create table if not exists players (
  id            bigint primary key,          -- ESPN Cricinfo athlete id (stable, from the CSV)
  short_name    text not null,
  full_name     text not null,
  country       text not null,
  is_overseas   boolean not null,
  role          text not null check (role in ('Batter', 'Bowler', 'All-Rounder', 'WK-Batter')),
  position      text,                         -- ESPN's descriptive label, e.g. "Top-order batter"
  batting_avg   numeric,
  bowling_avg   numeric,
  tier          text not null default 'random' check (tier in ('marquee', 'greats', 'popular', 'random')),
  popular_name  text                          -- nullable override of full_name for a well-known alias (e.g. "AB de Villiers"); falls back to full_name when null
);

-- Migration: tier/popular_name were added after this table was first
-- deployed to some environments (iteration 2). No-op on a fresh database;
-- backfills safely on one that predates these columns.
alter table players add column if not exists tier text not null default 'random';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_tier_check'
  ) then
    alter table players add constraint players_tier_check check (tier in ('marquee', 'greats', 'popular', 'random'));
  end if;
end $$;
alter table players add column if not exists popular_name text;

create table if not exists franchises (
  id                text primary key,         -- short slug, e.g. 'csk', 'gl'
  display_name      text not null,
  abbreviation      text not null,
  primary_color     text not null,
  secondary_color   text not null,
  logo_asset_path   text,                      -- nullable: falls back to monogram badge if absent
  is_active         boolean not null default true
);

-- Seed data: the 10 current IPL franchises. Colors were pixel-sampled
-- directly from the user-supplied logo composite (background swatch for
-- primary, name-band swatch for secondary), not guessed -- see the design
-- doc's "Franchise identity for teams" section. logo_asset_path points at
-- the cropped logo-on-background-sliver images in public/franchises/.
-- ON CONFLICT so this stays safe to re-run after a color tweak.
insert into franchises (id, display_name, abbreviation, primary_color, secondary_color, logo_asset_path)
values
  ('csk',  'Chennai Super Kings',         'CSK',  '#d1d63c', '#2d66ad', '/franchises/csk.png'),
  ('dc',   'Delhi Capitals',              'DC',   '#3e3f80', '#de554d', '/franchises/dc.png'),
  ('gt',   'Gujarat Titans',              'GT',   '#232e39', '#b89f66', '/franchises/gt.png'),
  ('kkr',  'Kolkata Knight Riders',       'KKR',  '#734283', '#e9c14c', '/franchises/kkr.png'),
  ('lsg',  'Lucknow Super Giants',        'LSG',  '#b2173d', '#e5a659', '/franchises/lsg.png'),
  ('mi',   'Mumbai Indians',              'MI',   '#206187', '#e7ce8c', '/franchises/mi.png'),
  ('pbks', 'Punjab Kings',                'PBKS', '#da3939', '#fadfb3', '/franchises/pbks.png'),
  ('rcb',  'Royal Challengers Bengaluru', 'RCB',  '#bb2634', '#081e5d', '/franchises/rcb.png'),
  ('rr',   'Rajasthan Royals',            'RR',   '#cc1462', '#26235b', '/franchises/rr.png'),
  ('srh',  'Sunrisers Hyderabad',         'SRH',  '#f15422', '#ee8339', '/franchises/srh.png')
on conflict (id) do update set
  display_name    = excluded.display_name,
  abbreviation    = excluded.abbreviation,
  primary_color   = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  logo_asset_path = excluded.logo_asset_path;

-- =========================================================================
-- Game / lobby
-- =========================================================================

create table if not exists games (
  id                  uuid primary key default gen_random_uuid(),
  room_code           text not null unique,     -- short shareable code, e.g. "K7QX2P"
  num_players         int not null check (num_players between 2 and 5),
  default_hint_purse  int not null default 20,
  num_rounds          int not null default 25 check (num_rounds between 1 and 25),  -- host-configurable at creation, so testing can use a short draft (e.g. 3) instead of a full 25
  current_round       int not null default 0,
  pick_order          jsonb not null default '[]'::jsonb,  -- ordered list of participant ids for the current round
  status              text not null default 'lobby' check (status in ('lobby', 'drafting', 'complete')),
  created_at          timestamptz not null default now()
);

-- Migration: the num_rounds column above was added after this table was
-- first deployed to some environments. This block is a no-op on a fresh
-- database (the create table above already has the column) and safely
-- backfills it on a database that predates it -- re-run the whole file any
-- time without worrying about which case you're in.
alter table games add column if not exists num_rounds int not null default 25;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'games_num_rounds_check'
  ) then
    alter table games add constraint games_num_rounds_check check (num_rounds between 1 and 25);
  end if;
end $$;

create table if not exists participants (
  id                      uuid primary key default gen_random_uuid(),
  game_id                 uuid not null references games(id) on delete cascade,
  seat_number             int not null,
  team_name               text not null,
  franchise_id            text references franchises(id),
  hint_purse_remaining    int not null,
  reconnect_token         text not null unique,  -- minted client-side at join, stored in localStorage
  is_host                 boolean not null default false,
  joined_at               timestamptz not null default now(),
  unique (game_id, seat_number),
  unique (game_id, franchise_id)  -- franchise picks are unique per game (nulls are not considered equal, so this still allows multiple participants with no franchise chosen yet)
);

-- =========================================================================
-- Draft: mystery cards + picks
--
-- SECURITY-CRITICAL SPLIT (see design doc "Architecture decision"):
-- round_cards is the PUBLIC-safe table. Anon clients (and Realtime) can read
-- it freely, but player_id stays NULL for any card whose status is 'hidden'.
-- round_card_assignments is PRIVATE: it holds the real player assigned to
-- each hidden slot, and has NO anon access at all (no RLS policy = deny).
-- Only server-side code using the service_role key may read it.
--
-- Flow: when a round starts, the server (service role) weighted-samples N
-- players and writes the real mapping into round_card_assignments, while
-- inserting matching placeholder rows into round_cards with player_id = NULL.
-- When a participant picks a slot, the server looks up the real player in
-- round_card_assignments and THEN updates round_cards.player_id + status,
-- which is the moment Realtime broadcasts the real identity to everyone.
-- =========================================================================

create table if not exists round_cards (
  id                        uuid primary key default gen_random_uuid(),
  game_id                   uuid not null references games(id) on delete cascade,
  round_number              int not null,
  slot_index                int not null,        -- position among the N cards revealed this round
  player_id                 bigint references players(id),  -- NULL until picked
  status                    text not null default 'hidden' check (status in ('hidden', 'picked')),
  picked_by_participant_id  uuid references participants(id),
  hint_tier_spent           int not null default 0 check (hint_tier_spent between 0 and 4),  -- UNUSED as of iteration 2: writing a real hint tier here would leak "a hint was used this round" onto this publicly-readable table. Hints are tracked in the private hint_purchases table below instead. Left in place rather than dropped to avoid a destructive migration; safe to ignore.
  picked_at                 timestamptz,
  created_at                timestamptz not null default now(),
  unique (game_id, round_number, slot_index)
);

create table if not exists round_card_assignments (
  round_card_id  uuid primary key references round_cards(id) on delete cascade,
  player_id      bigint not null references players(id)
);

-- =========================================================================
-- Hints (iteration 2, confirmed mechanic -- see design doc "Hints")
--
-- PRIVATE, same treatment as round_card_assignments: zero anon RLS policy
-- below, so only server-side code with the service_role key can read or
-- write this. A hint purchase is never shown to anyone but the participant
-- who paid for it -- round_cards.hint_tier_spent (above) is intentionally
-- left unused for this feature; writing to it would leak "a hint was used
-- this round" onto the publicly-readable round_cards table, contradicting
-- the confirmed "private per player" design.
--
-- The unique(participant_id, round_number) constraint is what actually
-- enforces "one committed tier, once per round" -- race-safe the same way
-- round_cards' unique(game_id, round_number, slot_index) makes concurrent
-- picks safe: a second insert attempt for the same participant+round just
-- fails at the database level.
-- =========================================================================

create table if not exists hint_purchases (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  round_number    int not null,
  tier            int not null check (tier between 1 and 4),
  cost            int not null check (cost > 0),
  purchased_at    timestamptz not null default now(),
  unique (participant_id, round_number)
);

-- =========================================================================
-- Playing XI (publicly viewable within the game)
-- =========================================================================

create table if not exists playing_xi (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  player_id       bigint not null references players(id),
  added_at        timestamptz not null default now(),
  unique (participant_id, player_id)
);

-- =========================================================================
-- Trades
-- =========================================================================

create table if not exists trades (
  id                          uuid primary key default gen_random_uuid(),
  game_id                     uuid not null references games(id) on delete cascade,
  proposer_participant_id     uuid not null references participants(id),
  target_participant_id       uuid not null references participants(id),
  offered_player_id           bigint not null references players(id),
  requested_player_id         bigint not null references players(id),
  status                      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at                  timestamptz not null default now(),
  resolved_at                 timestamptz
);

-- =========================================================================
-- Row Level Security
--
-- Nothing in this app uses Supabase Auth (no accounts -- room codes +
-- client-side reconnect tokens instead), so every policy below targets the
-- `anon` role. Reads are permissive where the data is meant to be visible
-- live in the lobby / draft / Playing XI views. There are NO anon write
-- policies anywhere -- every write (join, pick, trade, reveal) goes through
-- a Next.js Route Handler using the service_role key, which bypasses RLS
-- entirely and can enforce real validation (turn order, squad caps, etc.).
-- =========================================================================

alter table players enable row level security;
alter table franchises enable row level security;
alter table games enable row level security;
alter table participants enable row level security;
alter table round_cards enable row level security;
alter table round_card_assignments enable row level security;  -- intentionally NO policy below: fully locked to anon
alter table hint_purchases enable row level security;  -- intentionally NO policy below: fully locked to anon
alter table playing_xi enable row level security;
alter table trades enable row level security;

drop policy if exists "anon read players" on players;
create policy "anon read players" on players for select to anon using (true);

drop policy if exists "anon read franchises" on franchises;
create policy "anon read franchises" on franchises for select to anon using (true);

drop policy if exists "anon read games" on games;
create policy "anon read games" on games for select to anon using (true);

drop policy if exists "anon read participants" on participants;
create policy "anon read participants" on participants for select to anon using (true);

drop policy if exists "anon read round_cards" on round_cards;
create policy "anon read round_cards" on round_cards for select to anon using (true);

drop policy if exists "anon read playing_xi" on playing_xi;
create policy "anon read playing_xi" on playing_xi for select to anon using (true);

drop policy if exists "anon read trades" on trades;
create policy "anon read trades" on trades for select to anon using (true);

-- =========================================================================
-- Realtime: enable change broadcasts on the tables clients subscribe to.
-- (players / franchises / round_card_assignments don't need this -- the
-- first two rarely change, and the last must never reach the client.)
-- =========================================================================

do $$
declare
  t text;
begin
  foreach t in array array['games', 'participants', 'round_cards', 'playing_xi', 'trades']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
