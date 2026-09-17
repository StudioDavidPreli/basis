// The chart's geometry, pure (docs/spec.md, TimeSeriesChart): scales from
// d3-scale, paths from d3-shape, extents by hand, no D3 DOM. Everything the
// component draws is a function of the points, the domain, and the frame,
// so the server can render the first frame and the client can recompute
// one per animation tick without touching React.
//
// Dates travel as milliseconds since the epoch once they are points: a
// path is rebuilt on every frame of a domain animation, and parsing
// fifteen thousand ISO strings a frame is what would make that slow.

import { scaleLinear, scaleUtc } from 'd3-scale'
import { line } from 'd3-shape'
import type { Range } from '@/components/surface-state'
import type { Series } from './types'

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
