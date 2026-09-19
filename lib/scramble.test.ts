import { describe, it, expect } from 'vitest'
import { bezier, hash, measureCharset, scrambleFrame, synthesizeFrom } from './scramble'

const ease = bezier([0.4, 0, 0.2, 1])
const base = { settleSpan: 0.35, charset: 'abcxyz', holdMatching: true, ease }

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
    const early = scrambleFrame({ ...base, from: 'Anchor Kaze', target: 'Anchor Baram', progress: 0, tick: 0 })
    expect(early.slice(0, 7)).toBe('Anchor ')
    expect(early.length).toBe('Anchor Kaze'.length)
    for (const ch of early.slice(7)) expect('abcxyz'.includes(ch)).toBe(true)
  })

  it('length interpolates toward the target as progress runs', () => {
    const mid = scrambleFrame({ ...base, from: 'ab', target: 'abcdefghij', progress: 0.5, tick: 0 })
    expect(mid.length).toBeGreaterThan(2)
    expect(mid.length).toBeLessThan(10)
    expect(synthesizeFrom('ab', 'abcdefghij', 0.5, 0.35, ease).length).toBe(mid.length)
    // Shared leading characters hold as the length shrinks to the target's.
    expect(synthesizeFrom('abcdef', 'ab', 0.5, 0.35, ease)).toMatch(/^ab/)
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
    expect(synthesizeFrom(a, b, 0, 0.35, ease)).toBe(a)
    expect(synthesizeFrom(a, b, 0.0012, 0.35, ease)).toBe(a)
    expect(synthesizeFrom(a, b, 1, 0.35, ease)).toBe(b)
    // Equal-length texts were the trap: the old code sliced the target to
    // the interpolated length, which for two names of the same length is
    // the whole target at every progress.
    expect(a).toHaveLength(b.length)
  })

  it('is the frame\'s length and only ever real characters, at every progress', () => {
    const from = 'Anchor Kaze'
    const target = 'Keel London'
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const synth = synthesizeFrom(from, target, progress, 0.35, ease)
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
