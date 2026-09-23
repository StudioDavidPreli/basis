// Data quality: how much of the window the series covers, at what cadence,
// with what gaps, how much is still provisional, and the state of each
// input. The status rules are the ledger's (lib/present.ts).

import { dateMs } from '@/lib/chart'
import { ageLabel } from '@/lib/present'
import { isExpired } from '@/lib/status'
import { clip, isoDate, windowDays } from './window'
import { figureCell, text } from './derive'
import type { Report, ReportRow, ToolInput } from './types'

const DAY_MS = 86_400_000

export type Coverage = { first: number; last: number; points: number; medianStepDays: number; largestGapDays: number; provisionalShare: number }

export function coverage(points: import('@/lib/chart').Point[], provisionalFrom: string | null): Coverage | null {
  if (points.length === 0) return null
  const steps: number[] = []
  for (let i = 1; i < points.length; i++) steps.push((points[i]![0] - points[i - 1]![0]) / DAY_MS)
  const sorted = [...steps].sort((a, b) => a - b)
  const medianStep = sorted.length ? sorted[sorted.length >> 1]! : 0
  const provisionalMs = provisionalFrom ? dateMs(provisionalFrom) : null
  const provisional = provisionalMs === null ? 0 : points.filter(p => p[0] >= provisionalMs).length
  return { first: points[0]![0], last: points[points.length - 1]![0], points: points.length, medianStepDays: medianStep, largestGapDays: sorted.length ? sorted[sorted.length - 1]! : 0, provisionalShare: provisional / points.length }
}

export function qualityReport(input: ToolInput): Report {
  const rows: ReportRow[] = []
  const foot: string[] = []
  for (const s of input.series) {
    const facts = input.facts[s.id]
    const pts = clip(s.points, input.window)
    const c = coverage(pts, facts?.stored?.provisionalFrom ?? null)
    if (!c) {
      rows.push({ id: s.id, name: s.name, cells: [text('no points in the window')] })
      continue
    }
    rows.push({
      id: s.id,
      name: s.name,
      cells: [
        text(`${isoDate(c.first)} → ${isoDate(c.last)}`),
        figureCell(`Points in the window for ${s.name}`, c.points, 'integer', [s], input.now, `every ${c.medianStepDays.toFixed(0)} d`),
        figureCell(`Largest gap for ${s.name}`, c.largestGapDays, 'days', [s], input.now),
        figureCell(`Provisional share for ${s.name}`, c.provisionalShare, 'percent', [s], input.now, facts?.stored?.provisionalFrom ? `from ${facts.stored.provisionalFrom}` : undefined),
      ],
    })
    for (const src of s.sources) {
      const state = src.fixture ? 'fixture' : src.kind === 'api' ? (isExpired(src, input.now) ? 'stale' : 'current') : src.kind
      foot.push(`${s.name}: ${src.provider}, ${src.ref}, ${src.cadence}, ${ageLabel(src.asOf, input.now)}, ${state}.`)
    }
  }
  foot.push(`Coverage is the stored series inside the window; ${input.series.some(s => input.facts[s.id]?.stored?.coveredFrom === null) ? 'a series still on fixture has no backfill depth.' : 'backfill depth is the series’ coveredFrom.'} Revisions to the trailing week are not recorded.`)
  return {
    tool: 'quality',
    title: 'Data quality',
    scope: `${windowDays(input.window)} d · ${input.metric.label}`,
    head: ['', 'Coverage', 'Points', 'Largest gap', 'Provisional'],
    rows,
    foot,
  }
}
