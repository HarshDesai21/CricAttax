"use client";

import type { StoredSession } from "@/lib/types";

// Reconnect handling per the design doc: each participant gets a random
// token minted at join time, stored client-side, used to re-identify them
// as "still seat N" on reload rather than treating a refresh as a new join.
// Keyed by room code so a browser can hold sessions for multiple games at
// once (e.g. testing solo across several tabs).

function key(roomCode: string) {
  return `cricattax:game:${roomCode.toUpperCase()}`;
}

export function saveSession(roomCode: string, session: StoredSession) {
  try {
    localStorage.setItem(key(roomCode), JSON.stringify(session));
  } catch {
    // localStorage can throw (private browsing, storage disabled) -- losing
    // reconnect capability isn't fatal, the join/create flow itself still
    // succeeded, so we don't block on this.
  }
}

export function loadSession(roomCode: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(key(roomCode));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}
