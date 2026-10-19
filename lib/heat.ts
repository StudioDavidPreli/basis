// The Heat view's numbers (M12; decisions/2026-10-19-heat-measures-moves-
// in-sigma.md): every row's Level cut into buckets by the range, each
// bucket's move as a log return, and that move over the standard deviation
// of the row's own bucket moves in view. No mean is taken, so the sign is
// the move's: blue is up and rust is down whatever the row's drift. Pure.

import type { Range } from '@/components/surface-state'
import type { Point } from './chart'

export type BucketUnit = 'day' | 'week' | 'month'
export type Bucket = { fromMs: number; toMs: number; provisional: boolean } // both inclusive
export type HeatCell = { move: number; z: number | null } // move: a simple return, 0.034 is +3.4%
export type HeatGrid = { unit: BucketUnit; buckets: Bucket[]; cells: Record<string, Array<HeatCell | null>> }

const DAY = 86_400_000

export function bucketUnit(range: Range): BucketUnit {
  if (range === '1M') return 'day'
  if (range === '3M' || range === '1Y') return 'week'
  return 'month'
}

function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY
}

// Buckets covering [start, end]. Days and weeks are counted back from the
// end, so the last bucket always ends on the series' last day and a week
// is always seven; a leading part-week is dropped. Months are calendar
// months, the first clipped to the start.
export function bucketsFor(startMs: number, endMs: number, unit: BucketUnit, provisionalMs: number | null): Bucket[] {
  const out: Array<{ fromMs: number; toMs: number }> = []
  const last = dayStart(endMs) + DAY - 1
  if (unit === 'month') {
    const s = new Date(startMs)
    let y = s.getUTCFullYear()
    let m = s.getUTCMonth()
    for (;;) {
      const from = Date.UTC(y, m, 1)
      if (from > last) break
      const to = Math.min(Date.UTC(y, m + 1, 1) - 1, last)
      out.push({ fromMs: Math.max(from, dayStart(startMs)), toMs: to })
      m += 1
      if (m === 12) {
        m = 0
        y += 1
      }
    }
  } else {
    const span = unit === 'day' ? DAY : 7 * DAY
    for (let to = last; to - span + 1 >= dayStart(startMs); to -= span) out.unshift({ fromMs: to - span + 1, toMs: to })
  }
  return out.map(b => ({ ...b, provisional: provisionalMs !== null && b.toMs >= provisionalMs }))
}

// The last point at or before `ms`, by index into sorted points.
function lastAtOrBefore(points: Point[], ms: number): Point | null {
  let lo = 0
  let hi = points.length - 1
  let found: Point | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid]![0] <= ms) {
      found = points[mid]!
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

export function heatGrid(rows: Array<{ id: string; points: Point[] }>, view: [number, number], range: Range, provisionalMs: number | null): HeatGrid {
  const unit = bucketUnit(range)
  const buckets = bucketsFor(view[0], view[1], unit, provisionalMs)
  const cells: HeatGrid['cells'] = {}
  for (const r of rows) {
    const logs = buckets.map(b => {
      const end = lastAtOrBefore(r.points, b.toMs)
      const start = lastAtOrBefore(r.points, b.fromMs - 1)
      if (!end || !start || end[0] < b.fromMs || start[1] <= 0 || end[1] <= 0) return null
      return Math.log(end[1] / start[1])
    })
    const seen = logs.filter((v): v is number => v !== null)
    const sd = spread(seen)
    cells[r.id] = logs.map(l => (l === null ? null : { move: Math.expm1(l), z: sd ? l / sd : null }))
  }
  return { unit, buckets, cells }
}

// The root mean square about zero, the spread a move is measured in: no
// mean subtracted, as the header says. Null under two moves or none moving.
function spread(xs: number[]): number | null {
  if (xs.length < 2) return null
  const s = Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
  return s > 0 ? s : null
}

// A cell's tint: how far toward its direction's ink, 0 to 1, saturating at
// three of the row's own spreads.
export function heatShare(z: number): number {
  return Math.min(1, Math.abs(z) / 3)
}

const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

export function bucketLabel(b: Bucket, unit: BucketUnit): string {
  if (unit === 'month') return month.format(b.fromMs)
  if (unit === 'week') return `week of ${day.format(b.fromMs)}`
  return day.format(b.fromMs)
}

// The column heads: a short date on every nth bucket, so at most `most` are
// written and the rest stay blank but present.
export function headEvery(count: number, most: number): number {
  return Math.max(1, Math.ceil(count / most))
}

export function shortLabel(b: Bucket, unit: BucketUnit): string {
  return unit === 'month' ? month.format(b.fromMs) : day.format(b.fromMs)
}
