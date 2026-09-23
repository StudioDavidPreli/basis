// Model check: the process family's parameters estimated from the charted
// level inside the window, with a band, beside the config's truth. The
// truth is of the base process; the level carries the drivers' factor on
// top, so the gap between the two is itself part of the reading
// (decisions/2026-09-22-model-check-fits-the-level.md).

import type { Point } from '@/lib/chart'
import type { ProcessConfig } from '@/lib/config'
import { clip, windowDays } from './window'
import { mean, median, ols, sd } from './stats'
import { figureCell, text } from './derive'
import type { Report, ReportRow, ToolInput } from './types'

export type Estimate = { label: string; value: number | null; low: number | null; high: number | null; truth: number | null; format: 'number' | 'days' | 'integer' }

const Z = 1.96

function dayOfYear(ms: number): number {
  const d = new Date(ms)
  return (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000
}

export function estimate(process: ProcessConfig, points: Point[]): Estimate[] {
  const v = points.map(p => p[1])
  const n = v.length
  switch (process.family) {
    case 'ou': {
      // AR(1): x[t+1] = a + φ x[t]. θ = 1 − φ, half-life = ln 2 / −ln φ.
      const fit = ols(v.slice(0, -1), v.slice(1))
      if (!fit) return []
      const phi = fit.slope
      const se = Math.sqrt(Math.max(0, 1 - phi * phi) / Math.max(1, fit.n))
      const half = (p: number) => (p > 0 && p < 1 ? Math.log(2) / -Math.log(p) : null)
      const truthHalf = half(1 - process.theta)
      return [
        { label: 'half-life', value: half(phi), low: half(Math.min(0.999, phi + Z * se)) === null ? null : half(Math.max(0.001, phi - Z * se)), high: half(Math.min(0.999, phi + Z * se)), truth: truthHalf, format: 'days' },
        { label: 'mean μ', value: phi < 1 ? fit.intercept / (1 - phi) : null, low: null, high: null, truth: process.mu, format: 'number' },
        { label: 'σ per step', value: fit.residualSd, low: null, high: null, truth: process.sigma, format: 'number' },
        { label: 'steps', value: n, low: null, high: null, truth: null, format: 'integer' },
      ]
    }
    case 'drift': {
      const d = v.slice(1).map((x, i) => x - v[i]!)
      const m = mean(d)
      const s = sd(d)
      return [
        { label: 'drift μ per step', value: m, low: m !== null && s !== null ? m - (Z * s) / Math.sqrt(d.length) : null, high: m !== null && s !== null ? m + (Z * s) / Math.sqrt(d.length) : null, truth: process.mu, format: 'number' },
        { label: 'σ per step', value: s, low: null, high: null, truth: process.sigma, format: 'number' },
        { label: 'steps', value: n, low: null, high: null, truth: null, format: 'integer' },
      ]
    }
    case 'jump': {
      const d = v.slice(1).map((x, i) => x - v[i]!)
      const med = median(d) ?? 0
      const mad = median(d.map(x => Math.abs(x - med)))
      const robust = mad !== null ? 1.4826 * mad : null
      const jumps = robust !== null && robust > 0 ? d.filter(x => Math.abs(x - med) > 3 * robust) : []
      const quiet = robust !== null && robust > 0 ? d.filter(x => Math.abs(x - med) <= 3 * robust) : d
      return [
        { label: 'jumps beyond 3σ', value: jumps.length, low: null, high: null, truth: process.lambda * d.length, format: 'integer' },
        { label: 'mean jump size', value: jumps.length ? mean(jumps.map(x => Math.abs(x - med))) : null, low: null, high: null, truth: process.jumpSize, format: 'number' },
        { label: 'σ per step, jumps out', value: sd(quiet), low: null, high: null, truth: process.sigma, format: 'number' },
        { label: 'steps', value: n, low: null, high: null, truth: null, format: 'integer' },
      ]
    }
    case 'seasonal': {
      // Least squares on cos and sin at the config's period; the phase is
      // where the cosine peaks, as a fraction of the year.
      if (n < 4) return []
      const angles = points.map(p => (2 * Math.PI * dayOfYear(p[0])) / process.period)
      const c = angles.map(Math.cos)
      const s = angles.map(Math.sin)
      const mv = mean(v)!
      const mc = mean(c)!
      const ms = mean(s)!
      let scc = 0
      let sss = 0
      let scv = 0
      let ssv = 0
      let scs = 0
      for (let i = 0; i < n; i++) {
        const dc = c[i]! - mc
        const ds = s[i]! - ms
        const dv = v[i]! - mv
        scc += dc * dc
        sss += ds * ds
        scs += dc * ds
        scv += dc * dv
        ssv += ds * dv
      }
      const det = scc * sss - scs * scs
      if (det === 0) return []
      const bc = (scv * sss - ssv * scs) / det
      const bs = (ssv * scc - scv * scs) / det
      const amplitude = Math.hypot(bc, bs)
      let phase = Math.atan2(bs, bc) / (2 * Math.PI)
      if (phase < 0) phase += 1
      const resid = v.map((x, i) => x - (mv + bc * (c[i]! - mc) + bs * (s[i]! - ms)))
      return [
        { label: 'amplitude', value: amplitude, low: null, high: null, truth: process.amplitude, format: 'number' },
        { label: 'phase, fraction of the year', value: phase, low: null, high: null, truth: process.phase, format: 'number' },
        { label: 'σ of the residual', value: sd(resid), low: null, high: null, truth: process.sigma, format: 'number' },
        { label: 'steps', value: n, low: null, high: null, truth: null, format: 'integer' },
      ]
    }
  }
}

export function modelReport(input: ToolInput): Report {
  const rows: ReportRow[] = []
  for (const s of input.series) {
    const facts = input.facts[s.id]
    if (!facts) continue
    const pts = clip(s.points, input.window)
    const est = estimate(facts.process, pts)
    if (est.length === 0) {
      rows.push({ id: s.id, name: `${s.name} · ${facts.process.family}`, cells: [text('too few points in the window to fit')] })
      continue
    }
    for (const e of est) {
      rows.push({
        id: `${s.id}-${e.label}`,
        name: rows.some(r => r.id.startsWith(s.id)) ? '' : `${s.name} · ${facts.process.family}`,
        cells: [
          text(e.label),
          figureCell(`${e.label}, estimated for ${s.name}`, e.value, e.format, [s], input.now),
          e.low !== null && e.high !== null ? text(`${e.low.toFixed(e.format === 'integer' ? 0 : 1)} – ${e.high.toFixed(e.format === 'integer' ? 0 : 1)}`) : text(''),
          e.truth !== null ? text(e.format === 'integer' ? e.truth.toFixed(0) : e.format === 'days' ? `${e.truth.toFixed(1)} d` : e.truth.toFixed(2)) : text(''),
        ],
      })
    }
  }
  return {
    tool: 'model',
    title: 'Model check',
    scope: `${windowDays(input.window)} d · ${input.metric.label}`,
    head: ['', 'parameter', 'estimate', '95% band', 'config'],
    rows,
    foot: ['Fitted on the charted series inside the window. The config column is the truth of the base process the series was generated from; the level carries the drivers’ factor on top, so the gap is part of the reading.'],
  }
}
