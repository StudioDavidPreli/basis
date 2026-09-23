// Anomalies: the latest step against the window's steps, the largest
// moves, a CUSUM change point in the step returns.

import type { Point } from '@/lib/chart'
import { clip, isoDate, windowDays } from './window'
import { mean, sd, stepReturns } from './stats'
import { figureCell, text } from './derive'
import type { Report, ReportRow, ToolInput } from './types'

export type Anomalies = {
  zLast: number | null
  largest: Array<{ at: number; move: number }> // by absolute step move, value units
  changePointAt: number | null
  beyondTwoSigma: number
}

export function anomalies(points: Point[], top = 3): Anomalies | null {
  if (points.length < 4) return null
  const r = stepReturns(points)
  const m = mean(r)
  const s = sd(r)
  const zLast = m !== null && s !== null && s > 0 ? (r[r.length - 1]! - m) / s : null
  const moves = points.slice(1).map((p, i) => ({ at: p[0], move: p[1] - points[i]![1] }))
  const largest = [...moves].sort((a, b) => Math.abs(b.move) - Math.abs(a.move)).slice(0, top)
  // CUSUM of the demeaned returns: the change point is where the walk
  // strays furthest from zero.
  let changePointAt: number | null = null
  if (m !== null && r.length >= 4) {
    let sum = 0
    let best = 0
    let bestI = -1
    for (let i = 0; i < r.length; i++) {
      sum += r[i]! - m
      if (Math.abs(sum) > best) {
        best = Math.abs(sum)
        bestI = i
      }
    }
    if (bestI >= 0) changePointAt = points[bestI + 1]![0]
  }
  const beyondTwoSigma = m !== null && s !== null && s > 0 ? r.filter(x => Math.abs(x - m) > 2 * s).length : 0
  return { zLast, largest, changePointAt, beyondTwoSigma }
}

export function anomaliesReport(input: ToolInput): Report {
  const rows: ReportRow[] = input.series.map(s => {
    const pts = clip(s.points, input.window)
    const a = anomalies(pts)
    if (!a) return { id: s.id, name: s.name, cells: [text('fewer than four points in the window')] }
    const big = a.largest[0]
    return {
      id: s.id,
      name: s.name,
      cells: [
        figureCell(`Z-score of the latest step for ${s.name}`, a.zLast, 'number', [s], input.now, a.zLast !== null ? (Math.abs(a.zLast) > 2 ? 'beyond 2σ' : 'within 2σ') : undefined),
        big ? figureCell(`Largest move for ${s.name}`, big.move, 'number', [s], input.now, isoDate(big.at)) : text('—'),
        a.changePointAt !== null ? text(isoDate(a.changePointAt)) : text('—'),
        figureCell(`Steps beyond two sigma for ${s.name}`, a.beyondTwoSigma, 'integer', [s], input.now, `of ${pts.length - 1}`),
      ],
    }
  })
  return {
    tool: 'anomalies',
    title: 'Anomalies',
    scope: `${windowDays(input.window)} d · ${input.metric.label}`,
    head: ['', 'Latest step z', 'Largest move', 'Change point', 'Beyond 2σ'],
    rows,
    foot: ['Z against the window’s own step returns; the change point is where the cumulative sum of demeaned returns strays furthest from zero.'],
  }
}
