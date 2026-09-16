'use client'

// The seam between Cadence and every Basis component
// (contracts/cadence-basis.md, "useMotionTokens()"). This is the only module
// that imports the Framer module. Components read the hook and never the
// module, so the reduced-motion branch, and later the preset switch, live in
// exactly one place.

import { useMemo, useSyncExternalStore } from 'react'
import type { Transition } from 'framer-motion'
import {
  durations as moduleDurations,
  easings,
  delays as moduleDelays,
  scale,
  spring as moduleSpring,
} from 'cadence-tokens/dist/standard/cadence.motion.js'
import { REDUCED_MOTION_RESOLUTION } from 'cadence-tokens'

export type Durations = typeof moduleDurations
export type Delays = typeof moduleDelays
export type Easings = typeof easings
export type Scale = typeof scale

export type MotionTokens = {
  durations: Durations // flattened to 0.01 under reduced motion
  delays: Delays // flattened to 0 under reduced motion
  easings: Easings // unchanged
  scale: Scale // unchanged
  spring: Transition // Cadence spring, or { duration: 0.01 } under reduced motion
  transitions: {
    enter: Transition
    exit: Transition
    spring: Transition
  }
  reducedMotion: boolean
}

// The package states the policy in milliseconds; the Framer module runs in
// seconds. 10ms rather than 0 so onAnimationComplete still fires.
const REDUCED_DURATION = REDUCED_MOTION_RESOLUTION.duration / 1000
const REDUCED_DELAY = REDUCED_MOTION_RESOLUTION.delay / 1000

function flattened<T extends Record<string, number>>(source: T, value: number): T {
  const out = {} as Record<string, number>
  for (const key of Object.keys(source)) out[key] = value
  return out as T
}

const reducedDurations = flattened(moduleDurations, REDUCED_DURATION)
const reducedDelays = flattened(moduleDelays, REDUCED_DELAY)

// A spring has no duration to flatten. Under reduced motion it becomes a
// timed transition of the same 10ms, which is the branch the token file
// cannot express and the contract makes Basis's responsibility.
const reducedSpring: Transition = { duration: REDUCED_DURATION }

function build(reducedMotion: boolean): MotionTokens {
  const durations = reducedMotion ? reducedDurations : moduleDurations
  const delays = reducedMotion ? reducedDelays : moduleDelays
  const spring: Transition = reducedMotion ? reducedSpring : moduleSpring
  return {
    durations,
    delays,
    easings,
    scale,
    spring,
    // Rebuilt from the fields above, never the module's own `transitions`:
    // the module evaluates `duration: durations.base` at load, so its object
    // holds 0.2 no matter what happened to `durations` here.
    transitions: {
      enter: { duration: durations.base, ease: easings.enter },
      exit: { duration: durations.fast, ease: easings.exit },
      spring,
    },
    reducedMotion,
  }
}

// Both token sets are built once. The hook hands back one of two stable
// objects, so a consumer's dependency arrays see the same reference until
// the flag actually changes.
const tokensByFlag = { off: build(false), on: build(true) }

// ── The reduced-motion flag as an external store ─────────────────────────
//
// The inline script in app/layout.tsx writes `data-reduce-motion` on <html>
// before hydration, from prefers-reduced-motion and the `?reduce=1` override.
// The hook reads that attribute, not matchMedia, so there is exactly one
// source of truth and the command palette can flip it later by writing the
// same attribute. useSyncExternalStore is the React-sanctioned way to read
// browser state without branching on `window` during render: the server
// snapshot is `false`, hydration uses it, and the client snapshot takes over
// after hydration without a mismatch error.

const ATTRIBUTE = 'data-reduce-motion'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] })
  return () => observer.disconnect()
}

function getSnapshot() {
  return document.documentElement.getAttribute(ATTRIBUTE) === '1'
}

function getServerSnapshot() {
  return false
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useMotionTokens(): MotionTokens {
  const reducedMotion = useReducedMotion()
  return useMemo(() => (reducedMotion ? tokensByFlag.on : tokensByFlag.off), [reducedMotion])
}
