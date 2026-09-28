// The chart's geometry, pure (docs/spec.md, TimeSeriesChart): scales from
// d3-scale, paths from d3-shape, extents by hand, no D3 DOM. Everything the
// component draws is a function of the points, the domain, and the frame,
// so the server can render the first frame and the client can recompute
// one per animation tick without touching React.
//
// Dates travel as milliseconds since the epoch once they are points: a
// path is rebuilt on every frame of a domain animation, and parsing
// fifteen thousand ISO strings a frame is what would make that slow.

import { bisector } from 'd3-array'
import { scaleLinear, scaleUtc } from 'd3-scale'
import { line } from 'd3-shape'
import type { Range } from '@/components/surface-state'
import type { Series } from './types'
import { downsample, DOWNSAMPLE_ABOVE } from './downsample'

export type Point = [ms: number, value: number]
// [x0, x1, y0, y1]: the time window in ms and the value window.
export type Domain = [number, number, number, number]
export type Frame = { width: number; height: number }

// The plot's inner padding, in px of the frame: room for the endpoint
// marker on the right and half a marker above and below.
export const PAD = { top: 8, right: 14, bottom: 8, left: 0 }

// The server renders the first frame at this size; the client measures and
// redraws once on mount (components/time-series-chart.tsx).
export const NOMINAL: Frame = { width: 960, height: 360 }

const DAY_MS = 86_400_000

// Days back from the last point; null is the whole history.
export const RANGE_DAYS: Record<Range, number | null> = { '1M': 30, '3M': 91, '1Y': 365, '5Y': 1826, Max: null }

export function dateMs(date: string): number {
  return Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date)
}

export function toPoints(series: Series): Point[] {
  return series.map(([d, v]) => [dateMs(d), v])
}

// The window every charted series shares: it ends at the latest last
// point, starts the range's days before it (or at the earliest first
// point for Max), and its value window is the extent of what those dates
// show, widened to round numbers. Null when nothing is charted.
export function domainFor(list: Point[][], range: Range): Domain | null {
  const filled = list.filter(p => p.length > 0)
  if (filled.length === 0) return null
  const end = Math.max(...filled.map(p => p[p.length - 1]![0]))
  const days = RANGE_DAYS[range]
  const start = days === null ? Math.min(...filled.map(p => p[0]![0])) : end - days * DAY_MS
  let lo = Infinity
  let hi = -Infinity
  for (const points of filled) {
    for (const [t, v] of points) {
      if (t < start || t > end) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (!Number.isFinite(lo)) {
    // Nothing falls inside the window (a series shorter than the range and
    // ending earlier): show the last points rather than nothing.
    for (const points of filled) {
      const v = points[points.length - 1]![1]
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.01 || 1
    lo -= pad
    hi += pad
  }
  const [y0, y1] = scaleLinear().domain([lo, hi]).nice(5).domain() as [number, number]
  return [start, end, y0, y1]
}

// What a ribbon draws for a view range (docs/spec.md: LTTB above 500 points
// per series). The points inside the range and the history before it are
// downsampled apart: the range keeps up to the threshold of its own, so
// 1M, 3M and 1Y draw every point, and only 5Y and Max are reduced. The
// history before the range is off the plot except during a rescale, so it
// is reduced the same way and never costs the visible part its detail.
// The window rule is domainFor's: the range back from the last point.
export function viewPoints(points: Point[], range: Range, threshold: number = DOWNSAMPLE_ABOVE): Point[] {
  if (points.length <= threshold) return points
  const days = RANGE_DAYS[range]
  if (days === null) return downsample(points, threshold)
  const start = points[points.length - 1]![0] - days * DAY_MS
  const split = points.findIndex(p => p[0] >= start)
  if (split <= 0) return downsample(points, threshold)
  return [...downsample(points.slice(0, split), threshold), ...downsample(points.slice(split), threshold)]
}

export function xScale(domain: Domain, frame: Frame) {
  return scaleUtc()
    .domain([domain[0], domain[1]])
    .range([PAD.left, frame.width - PAD.right])
}

export function yScale(domain: Domain, frame: Frame) {
  return scaleLinear()
    .domain([domain[2], domain[3]])
    .range([frame.height - PAD.bottom, PAD.top])
}

export function pathFor(points: Point[], domain: Domain, frame: Frame): string {
  const x = xScale(domain, frame)
  const y = yScale(domain, frame)
  return (
    line<Point>()
      .x(p => x(p[0]))
      .y(p => y(p[1]))(points) ?? ''
  )
}

export function xTicks(domain: Domain, count: number): number[] {
  return scaleUtc()
    .domain([domain[0], domain[1]])
    .ticks(count)
    .map(d => d.getTime())
}

export function yTicks(domain: Domain, count: number): number[] {
  return scaleLinear().domain([domain[2], domain[3]]).ticks(count)
}

// Fixed locale and zone so the server and the client print the same label.
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const yearFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'UTC' })

export function formatDateTick(ms: number, spanMs: number): string {
  const days = spanMs / DAY_MS
  if (days <= 120) return dayFormat.format(ms)
  if (days <= 800) return monthFormat.format(ms).replace(' ', ' ’')
  return yearFormat.format(ms)
}

// ── The cursor (docs/spec.md, Chart) ─────────────────────────────────

const byTime = bisector<Point, number>(p => p[0])

// The index of the point nearest a time, or -1 with no points. Each
// ribbon takes its own nearest point, so a business-daily series and a
// daily one under one cursor each answer with a date they actually have.
export function nearestIndex(points: Point[], ms: number): number {
  if (points.length === 0) return -1
  return byTime.center(points, ms)
}

export type Anchor = { id: string; index: number }

// Which ribbon the pointer is on: the one whose line is nearest the
// pointer. Inside a ribbon's time extent that is the vertical distance to
// the line at the pointer's time, interpolated between its two
// neighbouring points, so a steep segment is as easy to take as a flat
// one and the pointer on a line is on that line. Outside its extent it is
// the distance in both axes to the ribbon's end, so a series that ended
// earlier does not win on height alone. The index is the ribbon's nearest
// point to the pointer's time. Null when nothing charted has a point.
export function anchorAt(rows: Array<{ id: string; points: Point[] }>, domain: Domain, frame: Frame, px: number, py: number): Anchor | null {
  const x = xScale(domain, frame)
  const y = yScale(domain, frame)
  const ms = x.invert(px).getTime()
  let best: Anchor | null = null
  let bestDistance = Infinity
  for (const r of rows) {
    const i = nearestIndex(r.points, ms)
    if (i < 0) continue
    const first = r.points[0]!
    const last = r.points[r.points.length - 1]!
    let d: number
    if (ms < first[0]) d = Math.hypot(x(first[0]) - px, y(first[1]) - py)
    else if (ms > last[0]) d = Math.hypot(x(last[0]) - px, y(last[1]) - py)
    else {
      const j = byTime.right(r.points, ms) // the first point after the time
      const a = r.points[Math.max(0, j - 1)]!
      const b = r.points[Math.min(r.points.length - 1, j)]!
      const t = b[0] === a[0] ? 0 : (ms - a[0]) / (b[0] - a[0])
      d = Math.abs(y(a[1] + (b[1] - a[1]) * t) - py)
    }
    if (d < bestDistance) {
      bestDistance = d
      best = { id: r.id, index: i }
    }
  }
  return best
}

// A position in the frame as a percentage of it, for the HTML overlays that
// share the SVG's box and must not stretch with it.
export function pct(px: number, total: number): string {
  return `${((px / total) * 100).toFixed(3)}%`
}

// The plot's aria-label, regenerated from what is charted (docs/spec.md,
// TimeSeriesChart). The table is the accessible alternative and the label
// says so.
export type SummaryInput = {
  label: string
  range: Range
  charted: Array<{ name: string; endpoint: string | null }>
  selected: number
  historyFrom: string | null
  provisionalFrom: string | null
}

export function summarize(s: SummaryInput): string {
  if (s.charted.length === 0) return 'No rows charted. Select rows in the table below to chart them.'
  const rows = s.charted.map(c => (c.endpoint ? `${c.name} ${c.endpoint}` : c.name)).join(', ')
  const waiting = s.selected - s.charted.length
  const parts = [
    `${s.label} over ${s.range}, ${s.charted.length} ${s.charted.length === 1 ? 'row' : 'rows'}${waiting > 0 ? ` of ${s.selected} selected` : ''}: ${rows}.`,
  ]
  if (s.historyFrom) parts.push(`History from ${s.historyFrom}.`)
  if (s.provisionalFrom) parts.push(`Values from ${s.provisionalFrom} are provisional.`)
  parts.push('The table below is the accessible alternative.')
  return parts.join(' ')
}

// The ledger's sparkline on a narrow viewport (docs/spec.md, narrow
// viewports): one row's series over the view range, scaled to its own
// extent, not the chart's shared one, because a line twelve pixels tall
// shows shape, not level. The same window rule as domainFor: it ends at the
// row's last point and starts the range back from it. Empty when there is
// nothing to draw; a flat series draws across the middle.
export function sparkPath(points: Point[], range: Range, frame: Frame): string {
  if (points.length === 0) return ''
  const end = points[points.length - 1]![0]
  const days = RANGE_DAYS[range]
  const start = days === null ? points[0]![0] : end - days * DAY_MS
  // Two points per pixel is all a line this small can show.
  const shown = downsample(points.filter(p => p[0] >= start), frame.width * 2)
  if (shown.length < 2) return ''
  let lo = Infinity
  let hi = -Infinity
  for (const [, v] of shown) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const x = scaleUtc().domain([shown[0]![0], end]).range([1, frame.width - 1])
  const y = lo === hi ? () => frame.height / 2 : scaleLinear().domain([lo, hi]).range([frame.height - 1, 1])
  return (
    line<Point>()
      .x(p => x(p[0]))
      .y(p => y(p[1]))(shown) ?? ''
  )
}
