// The Risk / return view's numbers (M12; decisions/2026-10-19-risk-return-
// reads-level.md, decisions/2026-10-19-risk-return-plots-the-window-
// change.md): for every row, its Level over the analysis window, realized
// volatility against the change over the window, both from the range
// summary's own math (lib/diagnostics/summary.ts), so the scatter and the
// diagnostics panel cannot disagree. Pure.

import { scaleLinear } from 'd3-scale'
import type { Point } from './chart'
import { clip, type WindowMs } from './diagnostics'
import { summarize } from './diagnostics/summary'

export type RiskPoint = {
  id: string
  change: number // over the window, first point to last, a fraction: 0.12 is +12%
  vol: number // annualized realized volatility, a fraction
  n: number // points in the window
}

// A row with fewer than two points in the window, or no volatility (one
// step), is left out: there is nothing to place.
export function riskReturn(rows: Array<{ id: string; points: Point[] }>, w: WindowMs): RiskPoint[] {
  const out: RiskPoint[] = []
  for (const r of rows) {
    const pts = clip(r.points, w)
    const s = summarize(pts)
    if (!s || s.vol === null) continue
    out.push({ id: r.id, change: s.changePct, vol: s.vol, n: pts.length })
  }
  return out
}

export type RiskDomain = { x: [number, number]; y: [number, number] }

// Volatility from zero, since none is the honest floor; change spanning
// zero, so the line between gaining and losing is always on the plot. Both
// widened to round numbers.
export function riskDomain(points: RiskPoint[]): RiskDomain | null {
  if (points.length === 0) return null
  const vmax = Math.max(...points.map(p => p.vol))
  const cmin = Math.min(0, ...points.map(p => p.change))
  const cmax = Math.max(0, ...points.map(p => p.change))
  const x = scaleLinear().domain([0, vmax > 0 ? vmax * 1.08 : 1]).nice(4).domain() as [number, number]
  const pad = (cmax - cmin) * 0.08 || 0.01
  const y = scaleLinear().domain([cmin < 0 ? cmin - pad : 0, cmax > 0 ? cmax + pad : 0]).nice(4).domain() as [number, number]
  return { x, y }
}

export function riskTicks(range: [number, number], count: number): number[] {
  return scaleLinear().domain(range).ticks(count)
}

export function medianVol(points: RiskPoint[]): number | null {
  if (points.length === 0) return null
  const v = points.map(p => p.vol).sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2
}

// Direct labels beside the points, never over each other: each takes the
// right side, else the left, else none (the point keeps its card and its
// table row). Boxes in pixels; greedy in order of height on the plot, so
// the result is the same for the same points.
export type LabelBox = { id: string; x: number; y: number; width: number; height: number }

export function placeLabels(boxes: LabelBox[], frameWidth: number, gap: number): Record<string, 'right' | 'left' | null> {
  const placed: Array<{ l: number; r: number; t: number; b: number }> = []
  const out: Record<string, 'right' | 'left' | null> = {}
  const hits = (l: number, r: number, t: number, b: number) => placed.some(p => l < p.r && r > p.l && t < p.b && b > p.t)
  for (const box of [...boxes].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))) {
    const t = box.y - box.height / 2
    const b = box.y + box.height / 2
    const right = { l: box.x + gap, r: box.x + gap + box.width }
    const left = { l: box.x - gap - box.width, r: box.x - gap }
    let side: 'right' | 'left' | null = null
    if (right.r <= frameWidth && !hits(right.l, right.r, t, b)) side = 'right'
    else if (left.l >= 0 && !hits(left.l, left.r, t, b)) side = 'left'
    if (side) placed.push({ ...(side === 'right' ? right : left), t, b })
    out[box.id] = side
  }
  return out
}

// Volatility is never signed; change is, as the figures are.
const pct = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export function formatVol(v: number): string {
  return `${pct.format(v * 100)}%`
}
export function formatAxisPct(v: number): string {
  const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(v * 100))
  if (v > 0) return `+${whole}%`
  if (v < 0) return `−${whole}%`
  return '0%'
}
