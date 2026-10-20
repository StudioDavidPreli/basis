// Attribution: the change over the window split between the base process
// and each driver, drawn as a waterfall (decisions/2026-10-19-attribution-
// draws-a-waterfall.md). Exact, not estimated: the level is base × factor,
// the base is the config's process replayed over the stored dates
// (lib/processes.ts), and the identity
//
//   L_end − L_start = (B_end − B_start)·F_start + B_end·(F_end − F_start)
//
// puts the base's own move first and the drivers' pull second. The factor
// is Σ weight · (1 + (driver − driver_first) / span) (lib/exposures.ts), so
// with the dominant driver's values stored per date its share of the pull
// is B_end · weight · (d_end − d_start) / span, exactly, and the other
// drivers' is the remainder. A series stored before companies carried the
// driver keeps the two-way split.

import { generate } from '@/lib/processes'
import { dateMs } from '@/lib/chart'
import { config, dominantDriver, type Exposure } from '@/lib/config'
import { figureCell, text } from './derive'
import { windowDays } from './window'
import type { Report, ReportRow, ToolInput, Waterfall } from './types'

export type Attribution = { change: number; fromBase: number; fromDrivers: number; startMs: number; endMs: number; s: number; e: number; start: number; end: number }

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
  return { change: Le - Ls, fromBase, fromDrivers, startMs, endMs, s, e, start: Ls, end: Le }
}

export type DriverSplit = { main: { driver: string; label: string; value: number }; rest: { label: string; value: number } | null }

// The drivers' pull split: the dominant driver's exact share, the rest by
// remainder, so the two always sum to `fromDrivers`. Null without the
// dominant driver's values per date.
export function splitDrivers(a: Attribution, base: number[], driver: number[] | undefined, exposures: Exposure[], spans: Record<string, { span: number; label: string }>): DriverSplit | null {
  if (!driver || driver.length !== base.length) return null
  const mainId = dominantDriver(exposures)
  const exposure = exposures.find(x => x.driver === mainId)!
  const meta = spans[mainId]
  if (!meta || meta.span === 0) return null
  const ds = driver[a.s]!
  const de = driver[a.e]!
  const main = base[a.e]! * exposure.weight * ((de - ds) / meta.span)
  const others = exposures.filter(x => x.driver !== mainId)
  if (others.length === 0) return { main: { driver: mainId, label: meta.label, value: a.fromDrivers }, rest: null }
  const restLabel = others.length === 1 ? (spans[others[0]!.driver]?.label ?? others[0]!.driver) : 'the other drivers'
  return { main: { driver: mainId, label: meta.label, value: main }, rest: { label: restLabel, value: a.fromDrivers - main } }
}

const SPANS: Record<string, { span: number; label: string }> = Object.fromEntries(Object.entries(config.drivers).map(([id, d]) => [id, { span: d.span, label: d.label }]))

export function attributionReport(input: ToolInput): Report {
  const scope = `${windowDays(input.window)} d · Level`
  if (input.metric.derive !== 'level') {
    return { tool: 'attribution', title: 'Attribution', scope, head: [''], rows: [], foot: [`Attribution is of the level; ${input.metric.label} derives from it per point. Switch the metric to Level.`] }
  }
  let anyTwoWay = false
  const rows: ReportRow[] = input.series.map(s => {
    const facts = input.facts[s.id]
    if (!facts?.stored) return { id: s.id, name: s.name, cells: [text('no stored series')] }
    const base = generate(facts.process, facts.stored.dates, facts.baseLevel)
    const a = attribute(facts.stored.dates, facts.stored.level, base, input.window)
    if (!a) return { id: s.id, name: s.name, cells: [text('fewer than two points in the window')] }
    const split = splitDrivers(a, base, facts.stored.driver, facts.exposures, SPANS)
    const from = [s]
    const waterfall: Waterfall = split
      ? { start: a.start, end: a.end, steps: [{ label: 'base', value: a.fromBase }, { label: split.main.label, value: split.main.value }, ...(split.rest ? [{ label: split.rest.label, value: split.rest.value }] : [])] }
      : { start: a.start, end: a.end, steps: [{ label: 'base', value: a.fromBase }, { label: 'drivers together', value: a.fromDrivers }] }
    if (!split) anyTwoWay = true
    return {
      id: s.id,
      name: s.name,
      waterfall,
      cells: [
        figureCell('Change over the window', a.change, 'number', from, input.now),
        figureCell(`From the ${facts.process.family} base process`, a.fromBase, 'number', from, input.now),
        split ? figureCell(`From ${split.main.label}`, split.main.value, 'number', from, input.now, split.main.label) : figureCell('From the drivers together', a.fromDrivers, 'number', from, input.now, 'drivers together'),
        split?.rest ? figureCell(`From ${split.rest.label}`, split.rest.value, 'number', from, input.now, split.rest.label) : { kind: 'empty' },
      ],
    }
  })
  const foot = ['Exact, not estimated: the level is the base process times the drivers’ factor. The main driver’s share is its own move times its weight; the other’s is what remains, so the steps sum to the change.']
  if (anyTwoWay) foot.push('A series stored before the drivers were kept per date splits only base and drivers together until the next refresh.')
  return {
    tool: 'attribution',
    title: 'Attribution',
    scope,
    head: ['', 'Change', 'From the base process', 'From the main driver', 'From the other driver'],
    rows,
    foot,
  }
}
