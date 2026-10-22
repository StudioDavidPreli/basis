'use client'

// Scramble text (contracts/cadence-basis.md, "Drawer entity switch"): when
// `text` changes, every character that differs churns through noise for a
// moment and resolves into the new one; shared characters hold still. The
// pure frame math is lib/scramble.ts. Timing is all tokens: the transition
// runs over durations.slower, the glyph clock ticks every delays.short,
// the length, the onsets, and the settle schedule ease on
// easings.standard, and under reduced motion the text simply changes.
//
// Progress and the tick live in a small external store read through
// useSyncExternalStore (the pattern every browser-driven value in Basis
// uses), started from a layout effect so no settled frame of the new text
// paints ahead of the churn. The visible glyphs are aria-hidden; a
// visually hidden copy of the real text is what assistive tech reads.
//
// `persistKey` keeps the store in a module map, so a text whose component
// remounts (the drawer's, on every entity switch) still comes FROM what
// was on screen. The owner resets its keys when the run is over.

import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type ElementType } from 'react'
import { useMotionTokens } from '@/lib/motion/tokens'
import { bezier, measureCharset, scrambleFrame, synthesizeFrom, type Spans } from '@/lib/scramble'

// The schedule's spans (lib/scramble.ts, Spans): onsets spread over the
// first 0.3 of eased progress, and every character churns for at least
// 0.35 after its onset. Fractions of the token duration, not timings of
// their own.
const SPANS: Spans = { onset: 0.3, settle: 0.35 }

type State = {
  progress: number // 0..1; 1 is settled, also the resting state
  tick: number // the glyph clock
  from: string // the text the transition comes from
  target: string // the text it goes to
}

function createStore(text: string) {
  let state: State = { progress: 1, tick: 0, from: text, target: text }
  const server: State = state
  // Whether a clock is driving progress right now. The effect below asks
  // this before trusting the store's target: under React's development
  // Strict Mode the effect runs, is cleaned up (which stops the clock), and
  // runs again on a store that already names the new target at progress
  // zero. Without this flag that second run returned early and the text
  // froze on its first noise frame. Production runs the effect once.
  let running = false
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach(l => l())
  const set = (next: Partial<State>) => {
    state = { ...state, ...next }
    emit()
  }
  return {
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    get: () => state,
    getServer: () => server,
    isRunning: () => running,
    // No transition: the text just is.
    settle(text: string) {
      if (state.progress < 1 || state.target !== text) set({ progress: 1, tick: 0, from: text, target: text })
    },
    // Runs one transition from `from` to `target`; returns the stop function.
    start(from: string, target: string, ms: number, tickMs: number) {
      set({ progress: 0, tick: 0, from, target })
      running = true
      const t0 = performance.now()
      let raf = 0
      // Progress is a function of the clock, read on every frame and on
      // every glyph tick, so a tab hidden mid-transition (no animation
      // frames) still resolves rather than churning until it is shown.
      // Clamped at both ends. A rAF timestamp is the frame's start and can
      // precede t0, so an unclamped `at` returned small negative numbers
      // that flowed into the ease and the frame math.
      const at = (now: number) => Math.min(1, Math.max(0, (now - t0) / ms))
      const clock = tickMs > 0
        ? setInterval(() => {
            const p = at(performance.now())
            set({ tick: state.tick + 1, progress: p })
            if (p >= 1) {
              clearInterval(clock)
              running = false
            }
          }, tickMs)
        : 0
      const step = (now: number) => {
        const p = at(now)
        set({ progress: p })
        if (p < 1) raf = requestAnimationFrame(step)
        else {
          clearInterval(clock)
          running = false
        }
      }
      raf = requestAnimationFrame(step)
      return () => {
        cancelAnimationFrame(raf)
        clearInterval(clock)
        running = false
      }
    },
  }
}

type Store = ReturnType<typeof createStore>
// Module state, so it would be process-wide on the server, shared across
// requests and never reset. A keyed ScrambleText is only mounted by the
// drawer, after a client navigation, but the guard below makes the server
// case a fresh store regardless. Decided at module scope, not in render.
const stores = new Map<string, Store>()
const onServer = typeof window === 'undefined'

function storeFor(key: string | undefined, text: string): Store {
  if (!key || onServer) return createStore(text)
  let s = stores.get(key)
  if (!s) {
    s = createStore(text)
    stores.set(key, s)
  }
  return s
}

// Forget every persisted store whose key starts with the prefix.
export function resetScrambleStores(prefix: string): void {
  for (const key of [...stores.keys()]) if (key.startsWith(prefix)) stores.delete(key)
}

type Props = { text: string; as?: ElementType; className?: string; persistKey?: string }

export function ScrambleText({ text, as: Tag = 'span', className, persistKey }: Props) {
  const { durations, delays, easings, reducedMotion } = useMotionTokens()
  const [store] = useState(() => storeFor(persistKey, text))
  const { progress, tick, from, target } = useSyncExternalStore(store.subscribe, store.get, store.getServer)
  const ease = useMemo(() => bezier(easings.standard), [easings.standard])

  useLayoutEffect(() => {
    if (reducedMotion) {
      store.settle(text)
      return
    }
    const s = store.get()
    // Already there, or already on its way there. A store that names this
    // target at partial progress with no clock is a stopped transition (the
    // Strict Mode double run, above) and restarts from what is on screen.
    if (s.target === text && (s.progress >= 1 || store.isRunning())) return
    // An interrupted transition carries its length forward, from what is on
    // screen rather than from the old target it never reached. There is no
    // special case at zero: synthesizeFrom answers `from` there, which is
    // what is on screen. Reading a progress of a thousandth as "already
    // showing the target" is the bug that stopped one switch in four from
    // animating at all.
    const start = s.progress < 1 ? synthesizeFrom(s.from, s.target, s.progress, SPANS, ease) : s.target
    if (start === text) {
      store.settle(text)
      return
    }
    return store.start(start, text, durations.slower * 1000, delays.short * 1000)
  }, [text, reducedMotion, durations.slower, delays.short, ease, store])

  const charset = useMemo(() => measureCharset([from, target]), [from, target])
  if (progress >= 1 && (target === text || reducedMotion)) return <Tag className={className}>{text}</Tag>
  // A settled store that names another text is the frame before a
  // transition: the drawer's new content has mounted on the old entity's
  // store, and the layout effect above is about to start the churn. Show
  // the old text, not the new one: the store's subscription is passive, so
  // the render that starts the transition would otherwise paint the new
  // name settled for a frame and then scramble it from nothing.
  const shown = progress >= 1 ? target : scrambleFrame({ from, target, progress, tick, spans: SPANS, charset, holdMatching: true, ease })
  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </Tag>
  )
}
