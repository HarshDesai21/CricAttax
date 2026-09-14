# Cricattax

Real-time multiplayer IPL fantasy draft game. 2-5 players each draft a 25-player squad from randomized, weighted "mystery box" card reveals, spend a private hint budget to scout picks before choosing, trade players with each other, and build a live-updating Playing XI that every other player can see in real time. No accounts, no auth -- just a shareable room code, Kahoot/Jackbox-style.

## Status

Early scaffold. What's here so far:

- Next.js 16 (App Router, TypeScript, Tailwind) project skeleton
- Supabase schema (`supabase/schema.sql`) covering players, franchises, games, participants, the mystery-card draft flow, Playing XI, and trades -- with Row Level Security and a server-side masking design so hidden card identities can never leak to the client early
- A pipeline-check landing page (`app/page.tsx`) confirming the browser-to-Supabase and server-to-Supabase connections both work

Not built yet: the actual lobby/room-code flow, the draft engine (weighted reveal + pick handling), hints, trading, the Playing XI builder, and franchise identity/visual polish.

## Tech stack

- **Next.js** (App Router) on **Vercel** -- frontend + API routes
- **Supabase** (Postgres + Realtime) -- database and live updates, no separate backend server
- No Supabase Auth -- participants are identified by a room code + a client-side reconnect token, not user accounts

## Getting started

1. Copy `.env.example` to `.env.local` and fill in your Supabase project's URL, anon key, and service role key (Project Settings -> Data API in the Supabase dashboard).
2. In the Supabase SQL Editor, run `supabase/schema.sql` once to create all tables, policies, and Realtime publications.
3. Import the players CSV into the `players` table (Table Editor -> Insert -> Import data from CSV).
4. `npm install`
5. `npm run dev` and open `http://localhost:3000` -- both status checks on the page should read OK once the CSV is imported.

## Project structure

```
app/                  Next.js App Router pages and API routes
  api/health/         Server-side Supabase connectivity check (service role key)
  page.tsx            Landing / pipeline-check page
lib/supabase/
  client.ts           Browser Supabase client (anon key) -- safe for client components
  server.ts           Server-only Supabase client (service role key) -- Route Handlers only, never imported client-side
supabase/
  schema.sql          Full database schema, RLS policies, and Realtime setup
```

## Security note on mystery cards

`round_cards` is the public table clients read directly (including over Realtime) -- but a card's `player_id` stays `NULL` while its status is `'hidden'`. The real player assigned to each hidden slot lives in `round_card_assignments`, a second table with no client access at all (no RLS policy = fully denied). Only server-side code using the service role key can read it, and only a Route Handler decides when a pick officially reveals a card. See the comments in `supabase/schema.sql` for the full flow.
