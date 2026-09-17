import { describe, it, expect } from 'vitest'
import { dateMs, domainFor, formatDateTick, pathFor, pct, summarize, toPoints, xTicks, yTicks, PAD, type Domain } from './chart'

const DAY = 86_400_000

function daily(from: string, values: number[]) {
  const start = dateMs(from)
  return values.map((v, i) => [start + i * DAY, v] as [number, number])
}

describe('domainFor', () => {
  const a = daily('2026-01-01', Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 20) * 10))
  const b = daily('2026-06-01', Array.from({ length: 249 }, (_, i) => 50 + i * 0.1))

  it('is null with nothing charted', () => {
    expect(domainFor([], '1Y')).toBeNull()
    expect(domainFor([[]], '1Y')).toBeNull()
  })

  it('ends at the latest last point and starts the range back from it', () => {
    const d = domainFor([a, b], '1M')!
    const end = a[a.length - 1]![0]
    expect(d[1]).toBe(end)
    expect(d[0]).toBe(end - 30 * DAY)
  })

  it('Max starts at the earliest first point', () => {
    const d = domainFor([a, b], 'Max')!
    expect(d[0]).toBe(a[0]![0])
  })

  it('the value window covers only what the time window shows, rounded outward', () => {
    const d = domainFor([a, b], '1M')!
    const inWindow = [...a, ...b].filter(p => p[0] >= d[0] && p[0] <= d[1]).map(p => p[1])
    expect(d[2]).toBeLessThanOrEqual(Math.min(...inWindow))
    expect(d[3]).toBeGreaterThanOrEqual(Math.max(...inWindow))
    // Rounded: the ends are round numbers, not the raw extent.
    expect(Number.isInteger(d[2])).toBe(true)
    expect(Number.isInteger(d[3])).toBe(true)
  })

  it('a flat series still has a window', () => {
    const d = domainFor([daily('2026-01-01', [5, 5, 5])], 'Max')!
    expect(d[3]).toBeGreaterThan(d[2])
  })
})

describe('paths and ticks', () => {
  const frame = { width: 400, height: 200 }
  const domain: Domain = [dateMs('2026-01-01'), dateMs('2026-01-11'), 0, 100]

  it('draws one M then L per point, inside the padded frame', () => {
    const d = pathFor(daily('2026-01-01', [0, 50, 100]), domain, frame)
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    expect(d.startsWith('M')).toBe(true)
    expect(d.split('L')).toHaveLength(3)
    // First point: x at the left pad, y at the bottom pad (value 0).
    expect(numbers[0]).toBe(PAD.left)
    expect(numbers[1]).toBe(frame.height - PAD.bottom)
    // The last point sits on the right edge only when it is the domain end; here it is day 3 of 11.
    expect(numbers[4]).toBeLessThan(frame.width - PAD.right)
    expect(numbers[5]).toBe(PAD.top)
  })

  it('ticks fall inside the domain', () => {
    for (const t of xTicks(domain, 5)) expect(t >= domain[0] && t <= domain[1]).toBe(true)
    for (const t of yTicks(domain, 4)) expect(t >= 0 && t <= 100).toBe(true)
  })

  it('date ticks are labeled by the span, in UTC, en-US', () => {
    const ms = dateMs('2026-09-16')
    expect(formatDateTick(ms, 30 * DAY)).toBe('Sep 16')
    expect(formatDateTick(ms, 365 * DAY)).toBe('Sep ’26')
    expect(formatDateTick(ms, 1826 * DAY)).toBe('2026')
  })

  it('pct is a percentage string of the frame', () => {
    expect(pct(100, 400)).toBe('25.000%')
  })

  it('toPoints parses dates once', () => {
    expect(toPoints([['2026-09-16', 1]])).toEqual([[dateMs('2026-09-16'), 1]])
  })
})

describe('summarize', () => {
  it('says what is charted, the range, the endpoints, the depth, and where the numbers are', () => {
    const s = summarize({
      label: 'Level',
      range: '1Y',
      charted: [
        { name: 'Anchor Kaze', endpoint: '104.20' },
        { name: 'Keel London', endpoint: null },
      ],
      selected: 10,
      historyFrom: '2026-06-01',
      provisionalFrom: '2026-09-09',
    })
    expect(s).toBe(
      'Level over 1Y, 2 rows of 10 selected: Anchor Kaze 104.20, Keel London. History from 2026-06-01. Values from 2026-09-09 are provisional. The table below is the accessible alternative.',
    )
  })

  it('names the empty state', () => {
    expect(summarize({ label: 'Level', range: '1Y', charted: [], selected: 0, historyFrom: null, provisionalFrom: null })).toMatch(/^No rows charted/)
  })
})
