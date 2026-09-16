'use client'

import { useMemo, useSyncExternalStore } from 'react'

// The reader's clock as an external store, in half-minute ticks: the server
// snapshot is the render time, so hydration matches the HTML byte for byte,
// and the client snapshot takes over after, so stale ages and TTLs age on
// screen. Same pattern as the theme and the reduced-motion flag. Shared by
// the sheet and the drawer, which render Figures against the same clock.
const TICK_MS = 30_000

function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS)
  return () => clearInterval(id)
}

export function useNow(renderedAt: string): Date {
  const server = Math.floor(Date.parse(renderedAt) / TICK_MS)
  const tick = useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / TICK_MS), () => server)
  return useMemo(() => new Date(tick * TICK_MS), [tick])
}
