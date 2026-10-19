import { describe, it, expect } from 'vitest'
import { bucketLabel, bucketUnit, bucketsFor, headEvery, heatGrid, heatShare } from './heat'
import type { Point } from './chart'

const DAY = 86_400_000
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)
const daily = (from: number, n: number, f: (i: number) => number): Point[] => Array.from({ length: n }, (_, i) => [from + i * DAY, f(i)] as Point)

describe('bucketUnit', () => {
  it('is a day at 1M, a week at 3M and 1Y, a month beyond', () => {
    expect(bucketUnit('1M')).toBe('day')
    expect(bucketUnit('3M')).toBe('week')
    expect(bucketUnit('1Y')).toBe('week')
    expect(bucketUnit('5Y')).toBe('month')
    expect(bucketUnit('Max')).toBe('month')
  })
})

describe('bucketsFor', () => {
  it('counts weeks back from the last day, seven days each, dropping a leading part-week', () => {
    const end = day(2026, 10, 19)
    const b = bucketsFor(end - 91 * DAY, end, 'week', null)
    expect(b).toHaveLength(13)
    expect(b[b.length - 1]!.toMs).toBe(end + DAY - 1)
    for (const x of b) expect(x.toMs - x.fromMs + 1).toBe(7 * DAY)
  })

  it('cuts calendar months, the first clipped to the start', () => {
    const b = bucketsFor(day(2026, 7, 20), day(2026, 10, 19), 'month', null)
    expect(b.map(x => new Date(x.fromMs).toISOString().slice(0, 10))).toEqual(['2026-07-20', '2026-08-01', '2026-09-01', '2026-10-01'])
    expect(b[3]!.toMs).toBe(day(2026, 10, 19) + DAY - 1)
  })

  it('marks the buckets a source may still revise', () => {
    const end = day(2026, 10, 19)
    const b = bucketsFor(end - 10 * DAY, end, 'day', end - 2 * DAY)
    expect(b.filter(x => x.provisional)).toHaveLength(3)
  })
})

describe('heatGrid', () => {
  const start = day(2026, 1, 1)
  const end = start + 27 * DAY

  it('measures each bucket from the last point before it to its own last point', () => {
    const rising = daily(start - 7 * DAY, 35, i => 100 * Math.pow(1.01, i))
    const g = heatGrid([{ id: 'a', points: rising }], [start, end], '3M', null)
    expect(g.unit).toBe('week')
    expect(g.buckets).toHaveLength(4)
    for (const c of g.cells['a']!) expect(c!.move).toBeCloseTo(Math.pow(1.01, 7) - 1, 6)
  })

  it('keeps the sign: a steady riser is all up, never painted down by its own mean', () => {
    const rising = daily(start - 7 * DAY, 35, i => 100 * Math.pow(1.01, i) * (i % 7 === 0 ? 1.002 : 1))
    const g = heatGrid([{ id: 'a', points: rising }], [start, end], '3M', null)
    expect(g.cells['a']!.every(c => c!.z! > 0)).toBe(true)
  })

  it('scales by the row\'s own spread, so a quiet row\'s big week reads as plainly as a loud row\'s', () => {
    const quiet = daily(start - 7 * DAY, 35, i => 100 + (i === 20 ? 2 : 0) + (i % 2) * 0.1)
    const loud = daily(start - 7 * DAY, 35, i => 100 + (i === 20 ? 20 : 0) + (i % 2) * 1)
    const g = heatGrid([{ id: 'q', points: quiet }, { id: 'l', points: loud }], [start, end], '1M', null)
    const zq = Math.max(...g.cells['q']!.map(c => Math.abs(c?.z ?? 0)))
    const zl = Math.max(...g.cells['l']!.map(c => Math.abs(c?.z ?? 0)))
    expect(zq).toBeGreaterThan(2)
    expect(Math.abs(zq - zl) / zl).toBeLessThan(0.15)
  })

  it('leaves a bucket empty where the series has no point before or inside it', () => {
    const late = daily(start + 15 * DAY, 13, i => 100 + i)
    const g = heatGrid([{ id: 'a', points: late }], [start, end], '3M', null)
    expect(g.cells['a']![0]).toBeNull()
    expect(g.cells['a']![3]).not.toBeNull()
  })
})

describe('labels and tint', () => {
  it('names a bucket by its unit, and writes at most so many heads', () => {
    const b = { fromMs: day(2026, 9, 15), toMs: day(2026, 9, 21) + DAY - 1, provisional: false }
    expect(bucketLabel(b, 'week')).toBe('week of Sep 15')
    expect(bucketLabel(b, 'month')).toBe('Sep 26')
    expect(headEvery(52, 8)).toBe(7)
    expect(headEvery(13, 8)).toBe(2)
  })

  it('saturates the tint at three spreads', () => {
    expect(heatShare(1.5)).toBe(0.5)
    expect(heatShare(-4)).toBe(1)
  })
})
