// The scramble text transition, pure part (David's spec, Cadence
// docs/references/scramble-text-transition.md, ported without the syntax
// coloring). One string is on screen, the string changes, every character
// that differs churns through noise glyphs for a moment and resolves into
// the new character; characters the two strings share at the same position
// never move. The component (components/scramble-text.tsx) drives progress
// and the glyph tick on Cadence tokens; everything here is deterministic.

// Deterministic 32-bit hash of small integers. Every random-looking number
// comes from this, never from Math.random(): a per-frame random would
// re-roll each character's settle schedule on every frame and the effect
// would churn forever. Seeded on (col) it is stable for a whole transition;
// adding the tick is what makes the glyph itself change over time.
export function hash(a: number, b: number, c = 0): number {
  let h = (a * 0x27d4eb2d) ^ (b * 0x165667b1) ^ (c * 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

export const hash01 = (a: number, b: number, c = 0): number => hash(a, b, c) / 0x100000000

// The noise alphabet is measured from the texts themselves, minus
// whitespace (a space in the noise reads as a hole, not as churn), so the
// scrambled text looks like the thing it is turning into.
export function measureCharset(texts: string[]): string {
  return [...new Set(texts.join('').replace(/\s/g, ''))].sort().join('')
}

export type Ease = (p: number) => number

// A cubic bezier as CSS defines it, from the token's four numbers, so the
// length interpolation runs on Cadence's `standard` curve rather than a
// curve written here. Newton on x, then y.
export function bezier([x1, y1, x2, y2]: readonly number[] | number[]): Ease {
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1
  const c = (p1: number) => 3 * p1
  const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t
  const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1)
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1!, x2!)
      if (s === 0) break
      t -= (at(t, x1!, x2!) - x) / s
    }
    return at(Math.min(1, Math.max(0, t)), y1!, y2!)
  }
}

// The schedule. A transition's progress is linear in time; every moment
// below is compared to it EASED, through the token's `standard` curve
// (contracts/cadence-basis.md, "Drawer entity switch"). The glyph clock is
// one value and cannot ease; what eases is which characters are churning
// at each moment. `standard` moves slowly at both ends, so onsets ramp in,
// settles bunch in the middle, and the last characters resolve in a tail.
//
// Two spans, both fractions of the token duration rather than timings of
// their own: onsets are spread over the first `onset` of eased progress,
// and every character churns for at least `settle` after its onset.
export type Spans = { onset: number; settle: number }

// One position's moments, fixed for the whole transition. A position
// beyond the old text arrives by growth and churns from the moment the
// length reaches it: appearing is already an event. The two hashes are
// seeded apart so a late onset says nothing about a late settle.
export function moments(j: number, fromLength: number, spans: Spans): { onset: number; settle: number } {
  const onset = j < fromLength ? hash01(2, j) * spans.onset : 0
  const settle = onset + spans.settle + hash01(1, j) * (1 - onset - spans.settle)
  return { onset, settle }
}

// What is on screen at the moment a transition is interrupted, without the
// noise: the interpolated length, and at each position the character that
// has actually settled there — the target's where this position's moment has
// passed, the old text's where it has not. It ran the length and filled the
// whole of it with the target, which is only true near the end; at a
// progress of a thousandth it answered with the target entire, and a caller
// asking "am I already showing this?" believed it. That is how one entity
// switch in four stopped animating
// (docs/notes/2026-09-18-the-scramble-spec-is-flaky.md).
//
// The moments are `moments`', shared with `scrambleFrame`, so this and the
// frame on screen agree about which positions have resolved. At progress 0
// it is `from` exactly, at 1 it is `target`, and length is what must carry
// over or the text visibly jumps width.
export function synthesizeFrom(from: string, target: string, progress: number, spans: Spans, ease: Ease): string {
  const q = ease(progress)
  const len = Math.round(from.length + (target.length - from.length) * q)
  let out = ''
  for (let j = 0; j < len; j++) {
    const shared = from[j] !== undefined && from[j] === target[j]
    const done = shared || q >= moments(j, from.length, spans).settle
    out += done ? (target[j] ?? ' ') : (from[j] ?? ' ')
  }
  return out
}

export type FrameInput = {
  from: string
  target: string
  progress: number // 0..1, linear in time; eased here
  tick: number
  spans: Spans
  charset: string
  holdMatching: boolean
  ease: Ease
}

// The string to show at one moment of the transition.
export function scrambleFrame({ from, target, progress, tick, spans, charset, holdMatching, ease }: FrameInput): string {
  if (progress >= 1 || !charset) return target
  const q = ease(progress)
  const len = Math.round(from.length + (target.length - from.length) * q)
  let out = ''
  for (let j = 0; j < len; j++) {
    const shared = holdMatching && from[j] !== undefined && from[j] === target[j]
    const { onset, settle } = moments(j, from.length, spans)
    if (shared || q >= settle) out += target[j] ?? ' '
    else if (q < onset) out += from[j] ?? ' '
    else if (target[j] === ' ' && from[j] === ' ') out += ' '
    else out += charset[hash(1, j, tick) % charset.length]
  }
  return out
}
