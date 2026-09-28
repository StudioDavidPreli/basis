import { describe, it, expect } from 'vitest'
import { anchorAt, dateMs, domainFor, formatDateTick, nearestIndex, pathFor, pct, sparkPath, summarize, toPoints, viewPoints, RANGE_DAYS, xScale, xTicks, yScale, yTicks, PAD, type Domain, type Point } from './chart'

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

describe('the cursor', () => {
  const day = 86_400_000
  const daily: Point[] = Array.from({ length: 10 }, (_, i) => [i * day, 100 + i])
  const sparse: Point[] = [0, 3, 7].map(i => [i * day, 200 - i * 10])
  const frame = { width: 1000, height: 400 }
  const domain: Domain = [0, 9 * day, 90, 210]

  it('nearestIndex answers the nearest point, either side, and -1 for none', () => {
    expect(nearestIndex(daily, 2.4 * day)).toBe(2)
    expect(nearestIndex(daily, 2.6 * day)).toBe(3)
    expect(nearestIndex(daily, -5 * day)).toBe(0)
    expect(nearestIndex(daily, 50 * day)).toBe(9)
    expect(nearestIndex(sparse, 4 * day)).toBe(1)
    expect(nearestIndex([], 0)).toBe(-1)
  })

  it('anchorAt takes the ribbon whose nearest point is closest to the pointer', () => {
    const rows = [
      { id: 'a', points: daily },
      { id: 'b', points: sparse },
    ]
    const x = xScale(domain, frame)
    const y = yScale(domain, frame)
    // On the daily ribbon at day 5.
    expect(anchorAt(rows, domain, frame, x(5 * day), y(105))).toEqual({ id: 'a', index: 5 })
    // Near the sparse ribbon's day 3 point, at a time between its points:
    // it answers with a date it has, not an interpolation.
    expect(anchorAt(rows, domain, frame, x(3.4 * day), y(172))).toEqual({ id: 'b', index: 1 })
    // Nothing charted with points.
    expect(anchorAt([{ id: 'c', points: [] }], domain, frame, 10, 10)).toBeNull()
  })

  it('anchorAt reads the line at the pointer\'s time, so a steep segment is as easy to take as a flat one', () => {
    // A steep ribbon rising 100 between two days, and a flat one sitting
    // exactly on the steep one's lower vertex. Mid-segment, the pointer is
    // on the steep line and far from both its vertices; the flat ribbon's
    // vertex is nearer as a point, but the pointer is not on its line.
    const steep: Point[] = [[4 * day, 100], [5 * day, 200]]
    const flat: Point[] = [[4 * day, 100], [5 * day, 100]]
    const rows = [
      { id: 'flat', points: flat },
      { id: 'steep', points: steep },
    ]
    const x = xScale(domain, frame)
    const y = yScale(domain, frame)
    expect(anchorAt(rows, domain, frame, x(4.5 * day), y(150))!.id).toBe('steep')
    expect(anchorAt(rows, domain, frame, x(4.5 * day), y(105))!.id).toBe('flat')
  })

  it('anchorAt measures in both axes, so a ribbon that ended earlier does not win on height', () => {
    const early: Point[] = [[0, 150], [1 * day, 150]]
    const rows = [
      { id: 'early', points: early },
      { id: 'a', points: daily },
    ]
    const x = xScale(domain, frame)
    const y = yScale(domain, frame)
    // At day 8, level 150: the early ribbon's height matches exactly, but
    // its nearest point is seven days to the left; the daily ribbon at 108
    // is nearer in the frame.
    expect(anchorAt(rows, domain, frame, x(8 * day), y(150))!.id).toBe('a')
  })
})

describe('sparkPath', () => {
  const frame = { width: 64, height: 20 }
  const rising = daily('2025-01-01', Array.from({ length: 500 }, (_, i) => 100 + i))

  it('is empty with fewer than two points in the range', () => {
    expect(sparkPath([], '1Y', frame)).toBe('')
    expect(sparkPath(rising.slice(0, 1), '1Y', frame)).toBe('')
  })

  it('draws only the range, ending at the last point, across the whole frame', () => {
    const d = sparkPath(rising, '1M', frame)
    // 31 points: the last day and the thirty before it.
    expect(d.split('L').length).toBe(31)
    expect(d.startsWith('M1,19')).toBe(true)
    expect(d.endsWith('63,1')).toBe(true)
  })

  it('scales to its own extent, so a small move still fills the height', () => {
    const tiny = daily('2026-01-01', Array.from({ length: 30 }, (_, i) => 1000 + i * 0.001))
    const d = sparkPath(tiny, 'Max', frame)
    expect(d.startsWith('M1,19')).toBe(true)
    expect(d.endsWith('63,1')).toBe(true)
  })

  it('a flat series draws across the middle', () => {
    const flat = daily('2026-01-01', Array.from({ length: 10 }, () => 5))
    expect(sparkPath(flat, 'Max', frame)).toMatch(/^M1,10(L[\d.]+,10)+$/)
  })
})

describe('viewPoints', () => {
  const five = daily('2021-09-01', Array.from({ length: 1838 }, (_, i) => 100 + Math.sin(i / 9) * 5))

  it('draws every point of a range that fits the threshold', () => {
    for (const range of ['1M', '3M', '1Y'] as const) {
      const out = viewPoints(five, range)
      const start = five[five.length - 1]![0] - RANGE_DAYS[range]! * DAY
      const inside = five.filter(p => p[0] >= start)
      expect(out.filter(p => p[0] >= start)).toEqual(inside)
    }
  })

  it('reduces 5Y and Max to at most the threshold on the plot', () => {
    const max = viewPoints(five, 'Max')
    expect(max).toHaveLength(500)
    const out = viewPoints(five, '5Y')
    const start = five[five.length - 1]![0] - RANGE_DAYS['5Y']! * DAY
    expect(out.filter(p => p[0] >= start).length).toBeLessThanOrEqual(500)
    expect(out[out.length - 1]).toBe(five[five.length - 1])
  })

  it('passes a short series through', () => {
    const short = five.slice(-120)
    expect(viewPoints(short, 'Max')).toBe(short)
  })
})
