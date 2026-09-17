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

import { useEffect } from 'react'
import { animate, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { useMotionTokens } from './tokens'

export function useAnimatedNumber(value: number, format: (v: number) => string): MotionValue<string> {
  const { durations, easings } = useMotionTokens()
  const raw = useMotionValue(value)

  useEffect(() => {
    // A page does not animate in from zero: the MotionValue starts at the
    // first value, so the mount run finds nothing to do. Later changes
    // animate from wherever the value is now, which is what makes an
    // interrupted tick continue rather than restart. The check is against
    // the value itself, never a "first run" flag: a flag set by one run and
    // cleared by no cleanup is the shape of the scramble bug, and React's
    // development Strict Mode runs this effect twice on mount.
    if (raw.get() === value) return
    const controls = animate(raw, value, { duration: durations.slow, ease: easings.standard })
    return () => controls.stop()
  }, [value, raw, durations.slow, easings.standard])

  return useTransform(raw, format)
}
