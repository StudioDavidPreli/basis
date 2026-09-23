// Attribution: the change over the window split between the base process
// and the drivers together. Exact, not estimated: the level is base ×
// factor, the base is the config's process replayed over the stored
// dates (lib/processes.ts), and the identity
//
//   L_end − L_start = (B_end − B_start)·F_start + B_end·(F_end − F_start)
//
// puts the base's own move first and the drivers' pull second. The split
// among several drivers would need each driver's history, which the series
// key does not store (decisions/2026-09-22-attribution-base-and-drivers.md).

import { generate } from '@/lib/processes'
import { dateMs } from '@/lib/chart'
import { figureCell, text } from './derive'
import { windowDays } from './window'
import type { Bar, Report, ReportRow, ToolInput } from './types'

export type Attribution = { change: number; fromBase: number; fromDrivers: number; startMs: number; endMs: number }

export function attribute(dates: string[], level: number[], base: number[], w: { fromMs: number; toMs: number }): Attribution | null {
  const idx = dates.map((d, i) => [dateMs(d), i] as const).filter(([ms]) => ms >= w.fromMs && ms <= w.toMs)
  if (idx.length < 2) return null
  const [startMs, s] = idx[0]!
  const [endMs, e] = idx[idx.length - 1]!
  const Bs = base[s]!
  const Be = base[e]!
  const Ls = level[s]!
  const Le = level[e]!
  if (Bs === 0 || Be === 0) return null
  const Fs = Ls / Bs
  const Fe = Le / Be
  const fromBase = (Be - Bs) * Fs
  const fromDrivers = Be * (Fe - Fs)
  return { change: Le - Ls, fromBase, fromDrivers, startMs, endMs }
}

export function attributionReport(input: ToolInput): Report {
  const scope = `${windowDays(input.window)} d · Level`
  if (input.metric.derive !== 'level') {
    return { tool: 'attribution', title: 'Attribution', scope, head: [''], rows: [], foot: [`Attribution is of the level; ${input.metric.label} derives from it per point. Switch the metric to Level.`] }
  }
  const rows: ReportRow[] = input.series.map(s => {
    const facts = input.facts[s.id]
    if (!facts?.stored) return { id: s.id, name: s.name, cells: [text('no stored series')] }
    const base = generate(facts.process, facts.stored.dates, facts.baseLevel)
    const a = attribute(facts.stored.dates, facts.stored.level, base, input.window)
    if (!a) return { id: s.id, name: s.name, cells: [text('fewer than two points in the window')] }
    const total = Math.abs(a.fromBase) + Math.abs(a.fromDrivers)
    const bars: Bar[] = total > 0 ? [
      { label: `base process ${Math.round((Math.abs(a.fromBase) / total) * 100)}%`, share: Math.abs(a.fromBase) / total, tone: 'ink' },
      { label: `drivers together ${Math.round((Math.abs(a.fromDrivers) / total) * 100)}%`, share: Math.abs(a.fromDrivers) / total, tone: 'entity' },
    ] : []
    const drivers = facts.exposures.map(e => `${e.driver} ${Math.round(e.weight * 100)}%`).join(', ')
    return {
      id: s.id,
      name: s.name,
      bars,
      cells: [
        figureCell('Change over the window', a.change, 'number', [s], input.now),
        figureCell(`From the ${facts.process.family} base process`, a.fromBase, 'number', [s], input.now),
        figureCell('From the drivers together', a.fromDrivers, 'number', [s], input.now, drivers),
      ],
    }
  })
  return {
    tool: 'attribution',
    title: 'Attribution',
    scope,
    head: ['', 'Change', 'From the base process', 'From the drivers'],
    rows,
    foot: ['Exact, not estimated: the level is the base process times the drivers’ factor, both known. The split among several drivers waits for their histories in the series key.'],
  }
}
