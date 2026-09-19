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
// The thresholds are `scrambleFrame`'s, so this and the frame on screen
// agree about which positions have resolved. At progress 0 it is `from`
// exactly, at 1 it is `target`, and length is what must carry over or the
// text visibly jumps width.
export function synthesizeFrom(from: string, target: string, progress: number, settleSpan: number, ease: Ease): string {
  const len = Math.round(from.length + (target.length - from.length) * ease(progress))
  let out = ''
  for (let j = 0; j < len; j++) {
    const shared = from[j] !== undefined && from[j] === target[j]
    const threshold = shared ? 0 : hash01(1, j) * (1 - settleSpan) + settleSpan
    out += progress >= threshold ? (target[j] ?? ' ') : (from[j] ?? ' ')
  }
  return out
}

export type FrameInput = {
  from: string
  target: string
  progress: number // 0..1
  tick: number
  settleSpan: number // 0..1, how much of the transition one character spends scrambling
  charset: string
  holdMatching: boolean
  ease: Ease
}

// The string to show at one moment of the transition.
export function scrambleFrame({ from, target, progress, tick, settleSpan, charset, holdMatching, ease }: FrameInput): string {
  if (progress >= 1 || !charset) return target
  const len = Math.round(from.length + (target.length - from.length) * ease(progress))
  let out = ''
  for (let j = 0; j < len; j++) {
    const shared = holdMatching && from[j] !== undefined && from[j] === target[j]
    // Each position's settle moment is fixed for the whole transition.
    const threshold = shared ? 0 : hash01(1, j) * (1 - settleSpan) + settleSpan
    const done = progress >= threshold
    if (done && j < target.length) out += target[j]
    else if (done) out += ' '
    else if (target[j] === ' ' && from[j] === ' ') out += ' '
    else out += charset[hash(1, j, tick) % charset.length]
  }
  return out
}
