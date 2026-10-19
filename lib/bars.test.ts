import { describe, it, expect } from 'vitest'
import { barDomain, barGeometry } from './bars'

describe('barDomain', () => {
  it('takes zero in, so an all-positive column is drawn from zero', () => {
    expect(barDomain([88.46, 117.85, 101.42])).toEqual({ lo: 0, hi: 117.85 })
  })

  it('spans both signs for a change column', () => {
    expect(barDomain([18, -71, 58, undefined])).toEqual({ lo: -71, hi: 58 })
  })

  it('skips missing and non-finite values', () => {
    expect(barDomain([undefined, Number.NaN, -3])).toEqual({ lo: -3, hi: 0 })
  })

  it('is null when there is nothing to draw', () => {
    expect(barDomain([])).toBeNull()
    expect(barDomain([undefined])).toBeNull()
    expect(barDomain([0, 0])).toBeNull()
  })
})

describe('barGeometry', () => {
  const change = { lo: -71, hi: 58 }

  it('puts zero where the extent says', () => {
    expect(barGeometry(0, change).zero).toBeCloseTo(71 / 129)
    expect(barGeometry(5, { lo: 0, hi: 10 }).zero).toBe(0)
    expect(barGeometry(-5, { lo: -10, hi: 0 }).zero).toBe(1)
  })

  it('fills one half by the value over its own extreme', () => {
    expect(barGeometry(58, change)).toMatchObject({ negative: 0, positive: 1 })
    expect(barGeometry(29, change)).toMatchObject({ negative: 0, positive: 0.5 })
    expect(barGeometry(-71, change)).toMatchObject({ negative: 1, positive: 0 })
  })

  it('keeps the halves on one scale, so lengths compare across zero', () => {
    const g = barGeometry(-35.5, change)
    const room = g.zero // the negative half's room, in track widths
    expect(g.negative * room).toBeCloseTo(35.5 / 129)
    const h = barGeometry(35.5, change)
    expect(h.positive * (1 - h.zero)).toBeCloseTo(35.5 / 129)
  })

  it('draws nothing for a missing value or zero', () => {
    expect(barGeometry(undefined, change)).toMatchObject({ negative: 0, positive: 0 })
    expect(barGeometry(0, change)).toMatchObject({ negative: 0, positive: 0 })
  })
})
