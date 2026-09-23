// Relationships: how the charted rows move together, on step returns of
// the dates they share.

import type { Point } from '@/lib/chart'
import { clip, windowDays } from './window'
import { pearson } from './stats'
import { figureCell, text } from './derive'
import type { Report, ReportRow, ToolInput } from './types'

const ROLLING = 30

// Step returns on the dates two series share.
export function alignedReturns(a: Point[], b: Point[]): { ra: number[]; rb: number[] } {
  const byMs = new Map<number, number>()
  for (const p of b) byMs.set(p[0], p[1])
  const shared = a.filter(p => byMs.has(p[0]))
  const ra: number[] = []
  const rb: number[] = []
  for (let i = 1; i < shared.length; i++) {
    const a0 = shared[i - 1]![1]
    const a1 = shared[i]![1]
    const b0 = byMs.get(shared[i - 1]![0])!
    const b1 = byMs.get(shared[i]![0])!
    if (a0 === 0 || b0 === 0) continue
    ra.push(a1 / a0 - 1)
    rb.push(b1 / b0 - 1)
  }
  return { ra, rb }
}

export function correlation(a: Point[], b: Point[]): number | null {
  const { ra, rb } = alignedReturns(a, b)
  return pearson(ra, rb)
}

export function rollingCorrelation(a: Point[], b: Point[], steps = ROLLING): number | null {
  const { ra, rb } = alignedReturns(a, b)
  if (ra.length < steps) return null
  return pearson(ra.slice(-steps), rb.slice(-steps))
}

export function relateReport(input: ToolInput): Report {
  const series = input.series.map(s => ({ ...s, clipped: clip(s.points, input.window) }))
  if (series.length < 2) {
    return { tool: 'relate', title: 'Relationships', scope: `${windowDays(input.window)} d · ${input.metric.label}`, head: [''], rows: [], foot: ['Chart a second row to relate them.'] }
  }
  const rows: ReportRow[] = series.map(a => ({
    id: a.id,
    name: a.name,
    cells: series.map(b => (a.id === b.id ? { kind: 'empty' as const } : figureCell(`Correlation of step returns, ${a.name} and ${b.name}`, correlation(a.clipped, b.clipped), 'number', [a, b], input.now))),
  }))
  const [p, q] = series as [typeof series[number], typeof series[number]]
  const rolling = rollingCorrelation(p.clipped, q.clipped)
  const spreadNow = p.clipped.at(-1) && q.clipped.at(-1) ? p.clipped.at(-1)![1] - q.clipped.at(-1)![1] : null
  const spreadThen = p.clipped[0] && q.clipped[0] ? p.clipped[0][1] - q.clipped[0][1] : null
  rows.push({
    id: 'pair',
    name: `${p.name} and ${q.name}`,
    cells: [
      figureCell(`Rolling correlation over the last ${ROLLING} shared steps`, rolling, 'number', [p, q], input.now, `last ${ROLLING} shared steps`),
      figureCell(`Spread, ${p.name} less ${q.name}`, spreadNow, 'number', [p, q], input.now, spreadThen !== null && spreadNow !== null ? (Math.abs(spreadNow) < Math.abs(spreadThen) ? 'narrowing over the window' : 'widening over the window') : undefined),
      ...series.slice(2).map(() => text('')),
    ],
  })
  return {
    tool: 'relate',
    title: 'Relationships',
    scope: `${windowDays(input.window)} d · ${input.metric.label}`,
    head: ['', ...series.map(s => s.name)],
    rows,
    foot: ['Pearson correlation of simple step returns on the dates both series have; the last row is the first two charted rows, rolling and as a spread.'],
  }
}
