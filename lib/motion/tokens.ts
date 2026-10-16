'use client'

// The seam between Cadence and every Basis component
// (contracts/cadence-basis.md, "useMotionTokens()"). This is the only module
// that imports the Framer module. Components read the hook and never the
// module, so the reduced-motion branch, and later the preset switch, live in
// exactly one place.

import { useMemo, useSyncExternalStore } from 'react'
import { MotionGlobalConfig, type Transition } from 'framer-motion'
import * as standard from 'cadence-tokens/dist/standard/cadence.motion.js'
import * as snappy from 'cadence-tokens/dist/snappy/cadence.motion.js'
import * as cinematic from 'cadence-tokens/dist/cinematic/cadence.motion.js'
import { REDUCED_MOTION_RESOLUTION } from 'cadence-tokens'
import { REDUCE_KEY } from '@/app/theme-script'

// The three presets (decisions/2026-10-05-presets-for-the-embeds.md). The
// sheet is always Standard; an embed may name another with ?preset=, which
// the inline script writes as `data-preset` on <html>.
export const PRESETS = ['standard', 'snappy', 'cinematic'] as const
export type Preset = (typeof PRESETS)[number]
type PresetModule = typeof standard
const modules: Record<Preset, PresetModule> = { standard, snappy, cinematic }

export type Durations = PresetModule['durations']
export type Delays = PresetModule['delays']
export type Easings = PresetModule['easings']
export type Scale = PresetModule['scale']

export type MotionTokens = {
  durations: Durations // flattened to 0.01 under reduced motion
  delays: Delays // flattened to 0 under reduced motion
  easings: Easings // unchanged
  scale: Scale // unchanged
  spring: Transition // Cadence spring, or { duration: 0.01 } under reduced motion
  springDamped: Transition // the same spring critically damped, same reduced-motion branch
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


// A spring has no duration to flatten. Under reduced motion it becomes a
// timed transition of the same 10ms, which is the branch the token file
// cannot express and the contract makes Basis's responsibility.
const reducedSpring: Transition = { duration: REDUCED_DURATION }

// The Cadence spring critically damped (contracts/cadence-basis.md): the
// damping raised to 2·√(stiffness · mass), so it settles with no overshoot.
// Every number is the token's own; the relation is physics. For a use that
// wants the spring's motion without its bounce, the drawer.
function criticallyDamped(s: Transition): Transition {
  const { stiffness, mass } = s as { stiffness: number; mass: number }
  return { ...s, damping: 2 * Math.sqrt(stiffness * mass) }
}

function build(m: PresetModule, reducedMotion: boolean): MotionTokens {
  const { easings, scale } = m
  const durations = reducedMotion ? flattened(m.durations, REDUCED_DURATION) : m.durations
  const delays = reducedMotion ? flattened(m.delays, REDUCED_DELAY) : m.delays
  const spring: Transition = reducedMotion ? reducedSpring : m.spring
  const springDamped: Transition = reducedMotion ? reducedSpring : criticallyDamped(m.spring)
  return {
    durations,
    delays,
    easings,
    scale,
    spring,
    springDamped,
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
const tokensBy = Object.fromEntries(PRESETS.map(p => [p, { off: build(modules[p], false), on: build(modules[p], true) }])) as Record<
  Preset,
  { off: MotionTokens; on: MotionTokens }
>

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

// The hook's value is the server's (`false`) through hydration and the
// client's only after the first passive effects, so a Framer animation
// that starts at mount (an `initial` → `animate` on a ribbon or a popover
// present in the HTML) would start with the un-reduced tokens and run in
// full. Framer's global skip flag closes that: set here from the attribute
// at module evaluation, which on the client is before hydration, and kept
// in step with it after. A skipped animation applies its final keyframe
// and still fires its completion handler. Module scope, not render: the
// only place this branches on the document is before React runs.
function syncSkip() {
  MotionGlobalConfig.skipAnimations = getSnapshot()
}
if (typeof document !== 'undefined') {
  syncSkip()
  new MutationObserver(syncSkip).observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] })
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// The system's own preference, apart from the attribute: the palette needs
// it to say why its toggle cannot turn reduced motion off. Cadence's
// stylesheet flattens CSS timing under the media query whatever the
// attribute says, and Basis does not restate Cadence's durations to undo it
// (decisions/2026-09-28-palette-scope.md).
const QUERY = '(prefers-reduced-motion: reduce)'

function subscribeSystem(onChange: () => void) {
  const list = window.matchMedia(QUERY)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subscribeSystem, () => window.matchMedia(QUERY).matches, getServerSnapshot)
}

// Not a hook, like toggleTheme: it reads the attribute at the moment of the
// call. Only "on" is stored; turning it off removes the key, so the next
// load falls back to the system. Under the system preference it does
// nothing.
export function toggleReducedMotion(): void {
  if (window.matchMedia(QUERY).matches) return
  const next = !getSnapshot()
  document.documentElement.setAttribute(ATTRIBUTE, next ? '1' : '0')
  try {
    if (next) localStorage.setItem(REDUCE_KEY, '1')
    else localStorage.removeItem(REDUCE_KEY)
  } catch {}
}

// The preset, read from the attribute like the flag above. It is set once,
// before hydration, and never changes; the store form is for the server
// snapshot (Standard), so the first client render matches the server's.
function subscribePreset(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-preset'] })
  return () => observer.disconnect()
}

function getPreset(): Preset {
  const p = document.documentElement.getAttribute('data-preset')
  return PRESETS.find(x => x === p) ?? 'standard'
}

export function usePreset(): Preset {
  return useSyncExternalStore(subscribePreset, getPreset, () => 'standard')
}

// Without an argument, the root's preset. With one, that preset, under the
// same reduced-motion branch: the scoped exception the contract allows for
// the welcome (decisions/2026-10-16-the-introduction-runs-cinematic.md),
// whose element carries the matching data-preset for its stylesheet.
export function useMotionTokens(scoped?: Preset): MotionTokens {
  const reducedMotion = useReducedMotion()
  const root = usePreset()
  const preset = scoped ?? root
  return useMemo(() => (reducedMotion ? tokensBy[preset].on : tokensBy[preset].off), [preset, reducedMotion])
}
