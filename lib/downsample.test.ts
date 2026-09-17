import { describe, it, expect } from 'vitest'
import { DOWNSAMPLE_ABOVE, downsample } from './downsample'

describe('downsample (the M9 seam)', () => {
  it('passes a short series through untouched, same reference', () => {
    const points = [[0, 1], [1, 2], [2, 3]]
    expect(downsample(points)).toBe(points)
  })

  it('keeps the first and last points of a long series, whatever it does between', () => {
    const points = Array.from({ length: DOWNSAMPLE_ABOVE * 3 }, (_, i) => [i, Math.sin(i)] as [number, number])
    const out = downsample(points)
    expect(out[0]).toEqual(points[0])
    expect(out[out.length - 1]).toEqual(points[points.length - 1])
    expect(out.length).toBeLessThanOrEqual(points.length)
  })
})
