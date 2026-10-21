import { describe, expect, it } from 'vitest'
import { drawTimings } from './draw'

// Cinematic's slow and slower, in seconds.
const cinematic = { slow: 0.9, slower: 1.4 }

describe('drawTimings', () => {
  it('ranks by the ledger, not by arrival', () => {
    const { each } = drawTimings(['a', 'b', 'c', 'd'], ['d', 'b', 'a'], cinematic)
    expect([...each.keys()]).toEqual(['a', 'b', 'd'])
    expect(each.get('a')).toEqual({ delay: 0, duration: 0.9 })
    expect(each.get('d')!.delay).toBeCloseTo(0.9)
    expect(each.get('d')!.duration).toBeCloseTo(1.4)
  })

  it('lands in table order, the last at slower + slow, for any count', () => {
    for (const n of [2, 4, 12]) {
      const ids = Array.from({ length: n }, (_, i) => `r${i}`)
      const { each, lands } = drawTimings(ids, ids, cinematic)
      const ends = ids.map(id => each.get(id)!.delay + each.get(id)!.duration)
      for (let i = 1; i < n; i++) expect(ends[i]!).toBeGreaterThan(ends[i - 1]!)
      expect(lands).toBeCloseTo(2.3)
    }
  })

  it('draws one ribbon alone on slow, at once', () => {
    const { each, lands } = drawTimings(['a', 'b'], ['b'], cinematic)
    expect(each.get('b')).toEqual({ delay: 0, duration: 0.9 })
    expect(lands).toBeCloseTo(0.9)
  })

  it('keeps an id the ledger does not hold, after the ranked ones', () => {
    const { each } = drawTimings(['a'], ['x', 'a'], cinematic)
    expect([...each.keys()]).toEqual(['a', 'x'])
  })

  it('draws nothing when nothing arrives', () => {
    expect(drawTimings(['a'], [], cinematic)).toEqual({ each: new Map(), lands: 0 })
  })
})
