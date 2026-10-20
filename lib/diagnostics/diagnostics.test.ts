import { describe, it, expect } from 'vitest'
import { generate } from '@/lib/processes'
import type { Point } from '@/lib/chart'
import type { Source } from '@/lib/types'
import { summarize } from './summary'
import { alignedReturns, correlation } from './relate'
import { attribute, splitDrivers } from './attribution'
import { estimate } from './model'
import { coverage } from './quality'
import { anomalies } from './anomalies'
import { clip, normalizeWindow, windowLabel, windowMs } from './window'
import { stepsPerYear, pearson, ols } from './stats'
import { derived, unionSources } from './derive'
import { runTool } from './index'
import type { DiagnosticSeries, ToolInput } from './types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)
const daily = (values: number[], start = T0): Point[] => values.map((v, i) => [start + i * DAY, v])
const dates = (n: number, start = T0) => Array.from({ length: n }, (_, i) => new Date(start + i * DAY).toISOString().slice(0, 10))

const apiSource: Source = { kind: 'api', provider: 'Open-Meteo', ref: '2 m air temperature at Tokyo', url: 'https://example.test', asOf: '2026-09-21T12:00:00Z', cadence: 'hourly', ttlMs: 7_200_000 }
const fixtureSource: Source = { ...apiSource, provider: 'Frankfurter', ref: 'ECB EUR/USD reference rate', asOf: '2026-09-16', cadence: 'business-daily', ttlMs: 259_200_000, fixture: true }
const now = new Date('2026-09-21T13:00:00Z')

describe('the window', () => {
  it('follows the view when null, and takes the whole of the last day when set', () => {
    expect(windowMs(null, [1, 2])).toEqual({ fromMs: 1, toMs: 2 })
    const w = windowMs({ from: '2026-01-02', to: '2026-01-03' }, [0, 0])
    expect(w.fromMs).toBe(T0 + DAY)
    expect(w.toMs).toBe(T0 + 3 * DAY - 1)
    expect(clip(daily([1, 2, 3, 4]), w).map(p => p[1])).toEqual([2, 3])
  })
  it('normalizes typed dates: both needed, swapped into order, garbage refused', () => {
    expect(normalizeWindow('2026-03-01', '2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-03-01' })
    expect(normalizeWindow('2026-01-01', undefined)).toBeNull()
    expect(normalizeWindow('nope', '2026-01-01')).toBeNull()
  })
})

describe('stats', () => {
  it('steps per year from the mean step: daily 365, business-daily about 261', () => {
    expect(stepsPerYear(daily([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(365)
    // Five business days a week: Mon–Fri, skip two, Mon–Fri.
    const bd: Point[] = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map(d => [T0 + d * DAY, 1])
    expect(stepsPerYear(bd)).toBeGreaterThan(280)
    expect(stepsPerYear(bd)).toBeLessThan(310)
  })
  it('pearson and ols are what they say', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
    const fit = ols([0, 1, 2, 3], [1, 3, 5, 7])!
    expect(fit.slope).toBeCloseTo(2, 9)
    expect(fit.intercept).toBeCloseTo(1, 9)
  })
})

describe('range summary', () => {
  it('reads change, high, low, drawdown with recovery, and the last point’s percentile', () => {
    const s = summarize(daily([100, 110, 120, 90, 95, 125, 115]))!
    expect(s.change).toBe(15)
    expect(s.changePct).toBeCloseTo(0.15, 9)
    expect(s.high).toBe(125)
    expect(new Date(s.highAt).getUTCDate()).toBe(6)
    expect(s.low).toBe(90)
    expect(s.drawdown).toBeCloseTo(-0.25, 9) // 120 → 90
    expect(new Date(s.drawdownFrom).getUTCDate()).toBe(3)
    expect(new Date(s.drawdownTo).getUTCDate()).toBe(4)
    expect(s.recoveryDays).toBe(2) // 90 on the 4th, back at 120 on the 6th
    expect(s.percentile).toBeCloseTo(4 / 6, 9)
    expect(s.vol).toBeGreaterThan(0)
  })
  it('a drawdown never recovered says so, and one point is no summary', () => {
    expect(summarize(daily([100, 80, 70]))!.recoveryDays).toBeNull()
    expect(summarize(daily([100]))).toBeNull()
  })
})

describe('relationships', () => {
  it('aligns on shared dates and correlates step returns', () => {
    const a = daily([100, 110, 121, 133.1])
    const b = daily([50, 55, 60.5, 66.55])
    expect(alignedReturns(a, b).ra).toHaveLength(3)
    expect(correlation(a, b)).toBeCloseTo(1, 6)
    const c = daily([50, 45, 40.5, 36.45], T0 + DAY) // one day offset: three shared dates, two steps
    expect(alignedReturns(a, c).ra).toHaveLength(2)
  })
})

describe('attribution', () => {
  it('splits the change exactly between the base and the drivers', () => {
    const d = dates(5)
    const base = [100, 102, 104, 103, 105]
    const factor = [1, 1.01, 1.02, 1.05, 1.04]
    const level = base.map((b, i) => b * factor[i]!)
    const a = attribute(d, level, base, { fromMs: T0, toMs: T0 + 4 * DAY })!
    expect(a.change).toBeCloseTo(level[4]! - level[0]!, 9)
    expect(a.fromBase + a.fromDrivers).toBeCloseTo(a.change, 9)
    expect(a.fromBase).toBeCloseTo((105 - 100) * 1, 9)
    expect(a.fromDrivers).toBeCloseTo(105 * (1.04 - 1), 9)
  })
})

describe('the per-driver split', () => {
  // A level built the way the worker builds it: base × Σ weight · normalized driver.
  const d = dates(6)
  const base = [100, 101, 103, 102, 104, 106]
  const temp = [10, 11, 13, 12, 15, 14]
  const fx = [1.1, 1.12, 1.09, 1.08, 1.11, 1.13]
  const spans = { temp: { span: 20, label: 'Tokyo temperature' }, fx: { span: 0.1, label: 'EUR/USD' } }
  const exposures = [{ driver: 'temp', weight: 0.75 }, { driver: 'fx', weight: 0.25 }]
  const factor = base.map((_, i) => 0.75 * (1 + (temp[i]! - temp[0]!) / 20) + 0.25 * (1 + (fx[i]! - fx[0]!) / 0.1))
  const level = base.map((b, i) => b * factor[i]!)
  const w = { fromMs: T0 + DAY, toMs: T0 + 5 * DAY }

  it('gives each driver its exact share, and the steps sum to the change', () => {
    const a = attribute(d, level, base, w)!
    const split = splitDrivers(a, base, temp, exposures, spans)!
    expect(split.main.label).toBe('Tokyo temperature')
    expect(split.rest!.label).toBe('EUR/USD')
    // Each driver's own term in B_end · ΔF, computed directly.
    expect(split.main.value).toBeCloseTo(base[5]! * 0.75 * ((temp[5]! - temp[1]!) / 20), 9)
    expect(split.rest!.value).toBeCloseTo(base[5]! * 0.25 * ((fx[5]! - fx[1]!) / 0.1), 9)
    expect(a.fromBase + split.main.value + split.rest!.value).toBeCloseTo(level[5]! - level[1]!, 9)
  })

  it('gives a one-driver row one step, and keeps the two-way split without the driver per date', () => {
    const a = attribute(d, level, base, w)!
    const one = splitDrivers(a, base, temp, [{ driver: 'temp', weight: 1 }], spans)!
    expect(one.rest).toBeNull()
    expect(one.main.value).toBe(a.fromDrivers)
    expect(splitDrivers(a, base, undefined, exposures, spans)).toBeNull()
  })
})

describe('model check', () => {
  it('recovers a seeded OU series’ half-life inside its band, and the drift of a drift series', () => {
    const d = dates(1500)
    const ou = generate({ family: 'ou', theta: 0.05, mu: 100, sigma: 1.5, seed: 1101 }, d, 100)
    const est = estimate({ family: 'ou', theta: 0.05, mu: 100, sigma: 1.5, seed: 1101 }, daily(ou))
    const half = est.find(e => e.label === 'half-life')!
    expect(half.truth).toBeCloseTo(Math.log(2) / -Math.log(0.95), 6)
    expect(half.low).toBeLessThan(half.truth!)
    expect(half.high).toBeGreaterThan(half.truth!)
    expect(est.find(e => e.label === 'mean μ')!.value).toBeGreaterThan(95)
    expect(est.find(e => e.label === 'mean μ')!.value).toBeLessThan(105)
    const drift = generate({ family: 'drift', mu: 0.1, sigma: 1, seed: 7 }, d, 100)
    const dm = estimate({ family: 'drift', mu: 0.1, sigma: 1, seed: 7 }, daily(drift)).find(e => e.label === 'drift μ per step')!
    expect(dm.low).toBeLessThan(0.1)
    expect(dm.high).toBeGreaterThan(0.1)
  })
  it('finds a seasonal amplitude and phase near the config’s', () => {
    const d = dates(730)
    const p = { family: 'seasonal' as const, amplitude: 10, period: 365.25, phase: 0.57, sigma: 0.5, seed: 3 }
    const est = estimate(p, daily(generate(p, d, 100)))
    expect(est.find(e => e.label === 'amplitude')!.value).toBeGreaterThan(8)
    expect(est.find(e => e.label === 'amplitude')!.value).toBeLessThan(12)
    expect(Math.abs(est.find(e => e.label === 'phase, fraction of the year')!.value! - 0.57)).toBeLessThan(0.05)
  })
})

describe('data quality', () => {
  it('measures coverage, the median step, the largest gap, and the provisional share', () => {
    const pts: Point[] = [0, 1, 2, 5, 6, 7, 8, 9].map(i => [T0 + i * DAY, 1])
    const c = coverage(pts, new Date(T0 + 8 * DAY).toISOString().slice(0, 10))!
    expect(c.points).toBe(8)
    expect(c.medianStepDays).toBe(1)
    expect(c.largestGapDays).toBe(3)
    expect(c.provisionalShare).toBeCloseTo(2 / 8, 9)
  })
})

describe('anomalies', () => {
  it('scores the latest step, names the largest move, and finds the change point', () => {
    const flat = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 ? 0.2 : -0.2))
    const shifted = [...flat.slice(0, 15), ...flat.slice(15).map(v => v + 12)]
    const a = anomalies(daily(shifted))!
    expect(new Date(a.largest[0]!.at).getUTCDate()).toBe(16)
    expect(Math.abs(a.largest[0]!.move)).toBeGreaterThan(11)
    expect(new Date(a.changePointAt!).getUTCDate()).toBe(16)
    expect(a.beyondTwoSigma).toBeGreaterThanOrEqual(1)
    expect(Math.abs(a.zLast!)).toBeLessThan(1)
  })
})

describe('derived figures', () => {
  const s1: DiagnosticSeries = { id: 'a', name: 'A', points: daily([1, 2, 3]), sources: [apiSource], updatedAt: '2026-09-21T12:30:00Z' }
  const s2: DiagnosticSeries = { id: 'b', name: 'B', points: daily([3, 2, 1]), sources: [apiSource, fixtureSource], updatedAt: '2026-09-21T12:31:00Z' }
  it('carry the union of the inputs’ sources and the worst input’s status', () => {
    expect(unionSources([s1, s2])).toHaveLength(2)
    expect(derived(1, [s1], now).status).toBe('current')
    expect(derived(1, [s1, s2], now).status).toBe('stale') // the fixture
    expect(derived(1, [s1, s2], now).updatedAt).toBe('2026-09-21T12:31:00Z')
  })
  it('every tool answers a report with the row it was asked about', () => {
    const input: ToolInput = { series: [s1, s2], window: { fromMs: T0, toMs: T0 + 3 * DAY }, now, metric: { key: 'level', label: 'Level', derive: 'level' }, facts: {} }
    for (const tool of ['summary', 'relate', 'quality', 'anomalies'] as const) {
      const r = runTool(tool, input)
      expect(r.rows.map(x => x.id)).toContain('a')
      expect(r.title.length).toBeGreaterThan(0)
    }
    expect(runTool('attribution', input).rows[0]!.cells[0]).toEqual({ kind: 'text', text: 'no stored series' })
  })
})

describe('windowLabel', () => {
  it('writes the first and the last day inside the window, in UTC', () => {
    const w = windowMs({ from: '2026-06-17', to: '2026-09-16' }, [0, 0])
    expect(windowLabel(w)).toBe('Jun 17 – Sep 16')
  })
})
