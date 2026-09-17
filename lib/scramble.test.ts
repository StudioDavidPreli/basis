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
    expect(synthesizeFrom('ab', 'abcdefghij', 0.5, ease).length).toBe(mid.length)
    expect(synthesizeFrom('abcdef', 'ab', 0.5, ease)).toMatch(/^ab +$/)
  })

  it('every position resolves by the end', () => {
    const late = scrambleFrame({ ...base, from: 'xxxxxx', target: 'target', progress: 0.999, tick: 9 })
    expect(late).toBe('target')
  })
})
