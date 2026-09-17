'use client'

// Scramble text (contracts/cadence-basis.md, "Drawer entity switch"): when
// `text` changes, every character that differs churns through noise for a
// moment and resolves into the new one; shared characters hold still. The
// pure frame math is lib/scramble.ts. Timing is all tokens: the transition
// runs over durations.slower, the glyph clock ticks every delays.short,
// the length eases on easings.standard, and under reduced motion the text
// simply changes.
//
// Progress and the tick live in a small external store read through
// useSyncExternalStore (the pattern every browser-driven value in Basis
// uses), started from a layout effect so no settled frame of the new text
// paints ahead of the churn. The visible glyphs are aria-hidden; a
// visually hidden copy of the real text is what assistive tech reads.

import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type ElementType } from 'react'
import { useMotionTokens } from '@/lib/motion/tokens'
import { bezier, measureCharset, scrambleFrame, synthesizeFrom } from '@/lib/scramble'

// How much of the transition one character spends scrambling: a fraction
// of the token duration, not a timing of its own.
const SETTLE_SPAN = 0.35

type State = {
  progress: number // 0..1; 1 is settled, also the resting state
  tick: number // the glyph clock
  from: string // the text the transition comes from
  target: string // the text it goes to
}

function createStore(text: string) {
  let state: State = { progress: 1, tick: 0, from: text, target: text }
  const server: State = state
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
    // No transition: the text just is.
    settle(text: string) {
      if (state.progress < 1 || state.target !== text) set({ progress: 1, tick: 0, from: text, target: text })
    },
    // Runs one transition from `from` to `target`; returns the stop function.
    start(from: string, target: string, ms: number, tickMs: number) {
      set({ progress: 0, tick: 0, from, target })
      const t0 = performance.now()
      let raf = 0
      const clock = tickMs > 0 ? setInterval(() => set({ tick: state.tick + 1 }), tickMs) : 0
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms)
        set({ progress: p })
        if (p < 1) raf = requestAnimationFrame(step)
        else clearInterval(clock)
      }
      raf = requestAnimationFrame(step)
      return () => {
        cancelAnimationFrame(raf)
        clearInterval(clock)
      }
    },
  }
}

type Props = { text: string; as?: ElementType; className?: string }

export function ScrambleText({ text, as: Tag = 'span', className }: Props) {
  const { durations, delays, easings, reducedMotion } = useMotionTokens()
  const [store] = useState(() => createStore(text))
  const { progress, tick, from, target } = useSyncExternalStore(store.subscribe, store.get, store.getServer)
  const ease = useMemo(() => bezier(easings.standard), [easings.standard])

  useLayoutEffect(() => {
    if (reducedMotion) {
      store.settle(text)
      return
    }
    const s = store.get()
    if (s.target === text) return
    // An interrupted transition carries its length forward, from what is on
    // screen rather than from the old target it never reached.
    const start = s.progress < 1 ? synthesizeFrom(s.from, s.target, s.progress, ease) : s.target
    if (start === text) {
      store.settle(text)
      return
    }
    return store.start(start, text, durations.slower * 1000, delays.short * 1000)
  }, [text, reducedMotion, durations.slower, delays.short, ease, store])

  const charset = useMemo(() => measureCharset([from, target]), [from, target])
  if (progress >= 1) return <Tag className={className}>{text}</Tag>
  const shown = scrambleFrame({ from, target, progress, tick, settleSpan: SETTLE_SPAN, charset, holdMatching: true, ease })
  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </Tag>
  )
}
