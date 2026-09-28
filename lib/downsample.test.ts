import { describe, it, expect } from 'vitest'
import { DOWNSAMPLE_ABOVE, downsample } from './downsample'

type P = [number, number]
const series = (n: number, f: (i: number) => number): P[] => Array.from({ length: n }, (_, i) => [i, f(i)] as P)

describe('downsample (LTTB)', () => {
  it('passes a series at or under the threshold through untouched, same reference', () => {
    const short = series(3, i => i)
    expect(downsample(short)).toBe(short)
    const edge = series(DOWNSAMPLE_ABOVE, i => i)
    expect(downsample(edge)).toBe(edge)
  })

  it('returns exactly the threshold, first and last kept, in order', () => {
    const points = series(1838, i => Math.sin(i / 30))
    const out = downsample(points)
    expect(out).toHaveLength(DOWNSAMPLE_ABOVE)
    expect(out[0]).toBe(points[0])
    expect(out[out.length - 1]).toBe(points[points.length - 1])
    for (let i = 1; i < out.length; i++) expect(out[i]![0]).toBeGreaterThan(out[i - 1]![0])
  })

  it('returns only real points of the input', () => {
    const points = series(2000, i => Math.cos(i / 7) * 3 + i / 100)
    const set = new Set(points)
    for (const p of downsample(points, 120)) expect(set.has(p)).toBe(true)
  })

  it('keeps a lone spike that a stride would drop', () => {
    const points = series(1000, i => (i === 537 ? 50 : 0))
    const out = downsample(points, 50)
    expect(out.some(p => p[1] === 50)).toBe(true)
    // A stride of 20 from zero would skip index 537.
    expect(537 % 20).not.toBe(0)
  })

  it('keeps the extremes of a smooth wave within a bucket of them', () => {
    const points = series(1826, i => Math.sin((i / 1826) * Math.PI * 4))
    const out = downsample(points)
    const max = Math.max(...out.map(p => p[1]))
    const min = Math.min(...out.map(p => p[1]))
    expect(max).toBeGreaterThan(0.999)
    expect(min).toBeLessThan(-0.999)
  })

  it('a threshold under three passes through (nothing to bucket)', () => {
    const points = series(10, i => i)
    expect(downsample(points, 2)).toBe(points)
  })
})
