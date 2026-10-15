'use client'

import { useSyncExternalStore } from 'react'
import { CADENCE_DARK, THEMES, THEME_KEY, type Theme } from '@/app/theme-script'

// The theme is the `data-theme` attribute the inline script set, read as an
// external store: the same pattern as the reduced-motion flag in
// lib/motion/tokens.ts and the clock in use-now.ts. The server snapshot is
// the first stock, hydration uses it, the client snapshot takes over with no
// mismatch.
//
// Shared rather than private to the header because a Rive canvas cannot read
// CSS variables and has to be told which palette to bind
// (contracts/agent-presence.md, the `theme` property).

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

function getSnapshot(): Theme {
  const t = document.documentElement.getAttribute('data-theme')
  // The Cadence stocks map to the art they wear: dark ones to operate's
  // logos and Rive instance, light ones to passbook's. Explicit, so a new
  // stock cannot fall through to passbook unnoticed.
  return t === 'operate' || CADENCE_DARK.includes(t ?? '') ? 'operate' : 'passbook'
}

function getServerSnapshot(): Theme {
  return 'passbook'
}

// The server snapshot is the first stock, so on the dark stock a consumer
// renders the light stock's for one frame after hydration, until the client
// snapshot re-renders. The page's colors are right from the first paint: the
// stylesheet keys on the attribute, not on this.
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// Not a hook, and it closes over nothing: it reads the attribute at the
// moment of the click, so it keeps one identity for the life of the module
// and an effect or a memo block that lists it never re-runs on it.
//
// The switch is one crossfade of the whole page, a view transition of the
// root (contracts/cadence-basis.md, "The theme switch is one crossfade"):
// the browser fades a picture of the old stock into the new one at one
// rate, so the drawer, the chart's SVG, and the figures cannot each change
// at the speed of whatever transition they carry for another reason.
// `data-theme-switching` suspends those transitions until it is over.
// Without the API the switch is instant, everywhere at once.
export function toggleTheme(): void {
  const root = document.documentElement
  const next = THEMES[(THEMES.indexOf(getSnapshot()) + 1) % THEMES.length]!
  const apply = () => {
    root.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {}
  }
  if (typeof document.startViewTransition !== 'function') {
    root.setAttribute('data-theme-switching', '')
    apply()
    // One frame with transitions off, so the new values land, not animate.
    requestAnimationFrame(() => root.removeAttribute('data-theme-switching'))
    return
  }
  root.setAttribute('data-theme-switching', '')
  document
    .startViewTransition(apply)
    .finished.finally(() => root.removeAttribute('data-theme-switching'))
}
