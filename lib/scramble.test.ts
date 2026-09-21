import { describe, it, expect } from 'vitest'
import { bezier, hash, measureCharset, moments, scrambleFrame, synthesizeFrom } from './scramble'

const ease = bezier([0.4, 0, 0.2, 1])
const grid = Array.from({ length: 201 }, (_, i) => i / 200)
const spans = { onset: 0.3, settle: 0.35 }
const base = { spans, charset: 'abcxyz', holdMatching: true, ease }

describe('scramble', () => {
  it('hashes deterministically and differs by tick', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3))
    expect(hash(1, 2, 3)).not.toBe(hash(1, 2, 4))
  })

  it('measures the charset from the texts, without whitespace, sorted', () => {
    expect(measureCharset(['ba c', 'a\nd'])).toBe('abcd')
  })

  it('the standard bezier is a proper ease: 0 to 1, monotonic', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    let last = 0
    for (let i = 1; i <= 20; i++) {
      const v = ease(i / 20)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
    expect(ease(0.5)).toBeGreaterThan(0.4)
    expect(ease(0.5)).toBeLessThan(0.9)
  })

  it('settled shows the target, unsettled shows noise where the texts differ and holds where they match', () => {
    expect(scrambleFrame({ ...base, from: 'Anchor Kaze', target: 'Anchor Baram', progress: 1, tick: 0 })).toBe('Anchor Baram')
    // A progress past every onset and before any settle: eased progress in
    // [onset, onset + settle).
    const p = grid.find(p => ease(p) >= spans.onset && ease(p) < spans.onset + spans.settle)!
    const churn = scrambleFrame({ ...base, from: 'Anchor Kaze', target: 'Anchor Baram', progress: p, tick: 0 })
    expect(churn.slice(0, 7)).toBe('Anchor ')
    for (const ch of churn.slice(7)) expect('abcxyz'.includes(ch)).toBe(true)
  })

  // The eased schedule (contracts/cadence-basis.md: standard on the
  // length, the onsets, and the settle schedule). Two hundred positions
  // that all differ, a noise alphabet disjoint from both texts, so a
  // position's state is legible from its character: old, noise, or new.
  const from = 'x'.repeat(200)
  const target = 'y'.repeat(200)
  const legible = { ...base, charset: 'abc', from, target }
  const count = (p: number, ch: string) => [...scrambleFrame({ ...legible, progress: p, tick: 1 })].filter(c => c === ch).length

  it('is the old text at progress zero: nothing has begun', () => {
    expect(scrambleFrame({ ...legible, progress: 0, tick: 0 })).toBe(from)
  })

  it('churn ramps in rather than switching on: more onsets in the second eighth than the first', () => {
    const first = 200 - count(0.125, 'x')
    const second = 200 - count(0.25, 'x') - first
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(first)
  })

  it('settles taper at the end: fewer in the last 15% than in the middle 15%', () => {
    const middle = count(0.575, 'y') - count(0.425, 'y')
    const tail = 200 - count(0.85, 'y')
    expect(tail).toBeGreaterThan(0)
    expect(middle).toBeGreaterThan(tail)
    expect(scrambleFrame({ ...legible, progress: 1, tick: 0 })).toBe(target)
  })

  it('a position only ever moves forward: old, then noise, then new', () => {
    let last = ''
    for (const p of grid) {
      const frame = scrambleFrame({ ...legible, progress: p, tick: 2 })
      for (let j = 0; j < 200 && last; j++) {
        if (last[j] !== 'x') expect(frame[j]).not.toBe('x')
        if (last[j] === 'y') expect(frame[j]).toBe('y')
      }
      last = frame
    }
  })

  it('the synthesizer agrees with the frame at every position and progress', () => {
    for (const p of grid) {
      const frame = scrambleFrame({ ...legible, progress: p, tick: 4 })
      const synth = synthesizeFrom(from, target, p, spans, ease)
      for (let j = 0; j < 200; j++) expect(synth[j]).toBe(frame[j] === 'y' ? 'y' : 'x')
    }
  })

  it('a position that arrives by growth churns at once, and every moment is ordered', () => {
    for (let j = 0; j < 50; j++) {
      const m = moments(j, 20, spans)
      if (j >= 20) expect(m.onset).toBe(0)
      else expect(m.onset).toBeLessThanOrEqual(spans.onset)
      expect(m.settle).toBeGreaterThanOrEqual(m.onset + spans.settle)
      expect(m.settle).toBeLessThanOrEqual(1)
    }
  })

  it('length interpolates toward the target as progress runs', () => {
    const mid = scrambleFrame({ ...base, from: 'ab', target: 'abcdefghij', progress: 0.5, tick: 0 })
    expect(mid.length).toBeGreaterThan(2)
    expect(mid.length).toBeLessThan(10)
    expect(synthesizeFrom('ab', 'abcdefghij', 0.5, spans, ease).length).toBe(mid.length)
    // Shared leading characters hold as the length shrinks to the target's.
    expect(synthesizeFrom('abcdef', 'ab', 0.5, spans, ease)).toMatch(/^ab/)
  })

  // The regression that stopped one entity switch in four from animating:
  // synthesizeFrom answers "what is on screen", and at a progress of a
  // thousandth what is on screen is the old text, not the new one. The
  // caller compares its answer with the incoming text to decide whether a
  // transition is needed at all, so a wrong answer here cancels the
  // transition outright (docs/notes/2026-09-18-the-scramble-spec-is-flaky.md).
  it('is the old text at the very start and the new one at the end', () => {
    const a = 'Anchor Kaze'
    const b = 'Keel London'
    expect(synthesizeFrom(a, b, 0, spans, ease)).toBe(a)
    expect(synthesizeFrom(a, b, 0.0012, spans, ease)).toBe(a)
    expect(synthesizeFrom(a, b, 1, spans, ease)).toBe(b)
    // Equal-length texts were the trap: the old code sliced the target to
    // the interpolated length, which for two names of the same length is
    // the whole target at every progress.
    expect(a).toHaveLength(b.length)
  })

  it('is the frame\'s length and only ever real characters, at every progress', () => {
    const from = 'Anchor Kaze'
    const target = 'Keel London'
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const synth = synthesizeFrom(from, target, progress, spans, ease)
      const frame = scrambleFrame({ ...base, charset: measureCharset([from, target]), from, target, progress, tick: 3 })
      // The same length, so a transition restarting from it does not jump
      // the text's width.
      expect(synth).toHaveLength(frame.length)
      // Every position is the old character, the new one, or a hole. The
      // frame on screen shows noise at the unresolved ones; this never does,
      // which is the whole point of synthesizing rather than reading it.
      // (It cannot be checked the other way round — the noise alphabet is
      // drawn from both names, so a noise glyph equals the target's
      // character often enough to make that assertion lie.)
      for (let j = 0; j < synth.length; j++) expect([from[j], target[j], ' ']).toContain(synth[j])
    }
  })

  it('every position resolves by the end', () => {
    const late = scrambleFrame({ ...base, from: 'xxxxxx', target: 'target', progress: 0.999, tick: 9 })
    expect(late).toBe('target')
  })
})
