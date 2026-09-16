'use client'

// A figure that ticks to its new value (contracts/cadence-basis.md,
// "useAnimatedNumber"). Basis-side for now; a candidate to upstream into
// Cadence if Token Lab's live retiming turns out to be the same behavior.
//
// The number lives in a MotionValue, not in React state, so a tick never
// re-renders the row: Framer writes the formatted string straight to the
// DOM node each frame. Thirty rows of these can tick at once without a
// render (the M9 performance line). Timing is the contract's row for the
// value tick: duration.slow on ease.standard, through the hook, so reduced
// motion flattens it to 10 ms and the number just changes.

import { useEffect, useRef } from 'react'
import { animate, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { useMotionTokens } from './tokens'

export function useAnimatedNumber(value: number, format: (v: number) => string): MotionValue<string> {
  const { durations, easings } = useMotionTokens()
  const raw = useMotionValue(value)
  const first = useRef(true)

  useEffect(() => {
    // The first render sets the value with no tick: a page does not animate
    // in from zero. Later changes animate from wherever the value is now,
    // which is what makes an interrupted tick continue rather than restart.
    if (first.current) {
      first.current = false
      raw.set(value)
      return
    }
    const controls = animate(raw, value, { duration: durations.slow, ease: easings.standard })
    return () => controls.stop()
  }, [value, raw, durations.slow, easings.standard])

  return useTransform(raw, format)
}
