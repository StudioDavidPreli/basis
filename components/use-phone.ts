'use client'

import { useSyncExternalStore } from 'react'

// The phone tier (docs/spec.md; decisions/2026-10-20-two-breakpoints-640-and-900.md),
// read as an external store like the theme (use-theme.ts). The server
// snapshot is "not a phone", so the server and the hydration render agree;
// a phone re-renders once after hydration. What a phone hides before then,
// the stylesheet hides.
export const PHONE_QUERY = '(max-width: 639px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  )
}
