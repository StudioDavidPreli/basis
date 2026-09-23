// Range summary: what one series did over the window.

import { isoDate, clip, windowDays } from './window'
import { logReturns, sd, stepsPerYear } from './stats'
import { figureCell, text } from './derive'
import type { Report, ReportRow, ToolInput } from './types'

export type Summary = {
  change: number
  changePct: number
  annualized: number | null
  high: number
  highAt: number
  low: number
  lowAt: number
  drawdown: number // a fraction ≤ 0
  drawdownFrom: number
  drawdownTo: number
  recoveryDays: number | null // null: not recovered by the window's end
  vol: number | null // annualized, from log step returns
  percentile: number // of the last point among the window's values
}

export function summarize(points: import('@/lib/chart').Point[]): Summary | null {
  if (points.length < 2) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  const change = last[1] - first[1]
  const changePct = first[1] === 0 ? 0 : change / first[1]
  const years = (last[0] - first[0]) / (365.25 * 86_400_000)
  const annualized = years > 0 && first[1] > 0 && last[1] > 0 ? Math.pow(last[1] / first[1], 1 / years) - 1 : null
  let high = first
  let low = first
  for (const p of points) {
    if (p[1] > high[1]) high = p
    if (p[1] < low[1]) low = p
  }
  // Max drawdown: the deepest fall from a running peak, and the first
  // later point back at that peak.
  let peak = first
  let dd = 0
  let ddFrom = first
  let ddTo = first
  for (const p of points) {
    if (p[1] > peak[1]) peak = p
    const d = peak[1] === 0 ? 0 : (p[1] - peak[1]) / peak[1]
    if (d < dd) {
      dd = d
      ddFrom = peak
      ddTo = p
    }
  }
  let recoveryDays: number | null = null
  if (dd < 0) {
    const after = points.find(p => p[0] > ddTo[0] && p[1] >= ddFrom[1])
    if (after) recoveryDays = Math.round((after[0] - ddTo[0]) / 86_400_000)
  }
  const spy = stepsPerYear(points)
  const s = sd(logReturns(points))
  const vol = spy !== null && s !== null ? s * Math.sqrt(spy) : null
  const below = points.filter(p => p[1] < last[1]).length
  const percentile = points.length > 1 ? below / (points.length - 1) : 1
  return { change, changePct, annualized, high: high[1], highAt: high[0], low: low[1], lowAt: low[0], drawdown: dd, drawdownFrom: ddFrom[0], drawdownTo: ddTo[0], recoveryDays, vol, percentile }
}

export function summaryReport(input: ToolInput): Report {
  const rows: ReportRow[] = input.series.map(s => {
    const pts = clip(s.points, input.window)
    const sum = summarize(pts)
    if (!sum) return { id: s.id, name: s.name, cells: [text('fewer than two points in the window')] }
    const from = [s]
    return {
      id: s.id,
      name: s.name,
      cells: [
        figureCell(`Change over the window, ${input.metric.label}`, sum.change, 'number', from, input.now, `${sum.changePct >= 0 ? '+' : '−'}${Math.abs(sum.changePct * 10_000).toFixed(0)} bps`),
        figureCell('Annualized rate', sum.annualized, 'percent', from, input.now),
        figureCell('High in the window', sum.high, 'number', from, input.now, isoDate(sum.highAt)),
        figureCell('Low in the window', sum.low, 'number', from, input.now, isoDate(sum.lowAt)),
        figureCell('Max drawdown', sum.drawdown, 'percent', from, input.now, sum.recoveryDays === null ? `${isoDate(sum.drawdownFrom)} → ${isoDate(sum.drawdownTo)}, not recovered` : `${isoDate(sum.drawdownFrom)} → ${isoDate(sum.drawdownTo)}, ${sum.recoveryDays} d to recover`),
        figureCell('Realized volatility, annualized', sum.vol, 'percent', from, input.now),
        figureCell('Percentile of the last point', sum.percentile, 'percent', from, input.now),
      ],
    }
  })
  return {
    tool: 'summary',
    title: 'Range summary',
    scope: `${windowDays(input.window)} d · ${input.metric.label}`,
    head: ['', 'Change', 'Annualized', 'High', 'Low', 'Max drawdown', 'Realized vol', 'Last point sits at'],
    rows,
    foot: ['Derived from the charted series inside the window. Annualized from the window’s span; volatility from log step returns scaled by the series’ own steps per year.'],
  }
}
