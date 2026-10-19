import { describe, it, expect } from 'vitest'
import { formatAxisPct, formatVol, medianVol, placeLabels, riskDomain, riskReturn, type RiskPoint } from './risk-return'
import { summarize } from './diagnostics/summary'
import type { Point } from './chart'

const DAY = 86_400_000
const series = (n: number, f: (i: number) => number): Point[] => Array.from({ length: n }, (_, i) => [Date.UTC(2026, 0, 1) + i * DAY, f(i)] as Point)

describe('riskReturn', () => {
  const steady = series(91, i => 100 * Math.pow(1.001, i))
  const choppy = series(91, i => 100 + (i % 2 ? 4 : -4) + i * 0.05)
  const w = { fromMs: steady[0]![0], toMs: steady[90]![0] }

  it('takes each row\'s annualized change and volatility from the range summary over the window', () => {
    const [p] = riskReturn([{ id: 'a', points: steady }], w)
    const s = summarize(steady)!
    expect(p).toEqual({ id: 'a', change: s.annualized, vol: s.vol, n: 91 })
  })

  it('puts the choppy row right of the steady one', () => {
    const pts = riskReturn([{ id: 'steady', points: steady }, { id: 'choppy', points: choppy }], w)
    expect(pts.find(p => p.id === 'choppy')!.vol).toBeGreaterThan(pts.find(p => p.id === 'steady')!.vol)
  })

  it('clips to the window and leaves out a row with too little in it', () => {
    const half = { fromMs: steady[45]![0], toMs: steady[90]![0] }
    expect(riskReturn([{ id: 'a', points: steady }], half)[0]!.n).toBe(46)
    expect(riskReturn([{ id: 'a', points: steady.slice(0, 1) }, { id: 'b', points: [] }], w)).toEqual([])
  })
})

describe('riskDomain', () => {
  const p = (vol: number, change: number): RiskPoint => ({ id: `${vol}`, vol, change, n: 90 })

  it('starts volatility at zero and always spans zero change', () => {
    const d = riskDomain([p(0.1, 0.05), p(0.3, 0.2)])!
    expect(d.x[0]).toBe(0)
    expect(d.x[1]).toBeGreaterThanOrEqual(0.3)
    expect(d.y[0]).toBe(0)
    expect(d.y[1]).toBeGreaterThanOrEqual(0.2)
    const both = riskDomain([p(0.1, -0.15), p(0.2, 0.1)])!
    expect(both.y[0]).toBeLessThan(-0.15)
    expect(both.y[1]).toBeGreaterThan(0.1)
  })

  it('is null with nothing to plot', () => {
    expect(riskDomain([])).toBeNull()
  })
})

describe('medianVol', () => {
  it('is the middle volatility, or the mean of the middle two', () => {
    const p = (vol: number): RiskPoint => ({ id: `${vol}`, vol, change: 0, n: 2 })
    expect(medianVol([p(0.3), p(0.1), p(0.2)])).toBe(0.2)
    expect(medianVol([p(0.1), p(0.2), p(0.3), p(0.4)])).toBeCloseTo(0.25)
    expect(medianVol([])).toBeNull()
  })
})

describe('placeLabels', () => {
  const box = (id: string, x: number, y: number) => ({ id, x, y, width: 80, height: 14 })

  it('puts a label on the right when there is room', () => {
    expect(placeLabels([box('a', 100, 50)], 600, 8)).toEqual({ a: 'right' })
  })

  it('moves a label left at the right edge, and to the left of a neighbor in its way', () => {
    expect(placeLabels([box('a', 580, 50)], 600, 8)).toEqual({ a: 'left' })
    expect(placeLabels([box('a', 100, 50), box('b', 100, 55)], 600, 8)).toEqual({ a: 'right', b: 'left' })
  })

  it('drops a label with no room on either side, and decides the same way every time', () => {
    const boxes = [box('a', 100, 50), box('b', 100, 52), box('c', 100, 54)]
    expect(placeLabels(boxes, 600, 8)).toEqual({ a: 'right', b: 'left', c: null })
    expect(placeLabels([...boxes].reverse(), 600, 8)).toEqual(placeLabels(boxes, 600, 8))
  })
})

describe('formats', () => {
  it('writes volatility unsigned and the change axis signed', () => {
    expect(formatVol(0.145)).toBe('14.5%')
    expect(formatAxisPct(0.2)).toBe('+20%')
    expect(formatAxisPct(-0.1)).toBe('−10%')
    expect(formatAxisPct(0)).toBe('0%')
  })
})
