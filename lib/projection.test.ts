import { describe, it, expect } from 'vitest'
import { fanExtent, project, HORIZON_DAYS } from './projection'
import { generate } from './processes'
import type { ProcessConfig } from './config'

const DAY = 86_400_000
const dates = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 5, 1) + i * DAY).toISOString().slice(0, 10))
// A stored series whose drivers sit at a factor of 1.1 throughout.
const stored = (process: ProcessConfig) => ({ process, baseLevel: 100, dates, level: generate(process, dates, 100).map(v => v * 1.1) })

const ou: ProcessConfig = { family: 'ou', theta: 0.05, mu: 100, sigma: 1.5, seed: 1101 }
const drift: ProcessConfig = { family: 'drift', mu: 0.02, sigma: 0.9, seed: 2203 }
const seasonal = { family: 'seasonal', amplitude: 6, period: 365, phase: 0.57, sigma: 0.6, seed: 3301 } as ProcessConfig
const jump = { family: 'jump', sigma: 0.8, lambda: 0.04, jumpSize: 6, seed: 4401 } as ProcessConfig

const width = (f: ReturnType<typeof project>, k: number) => f[k]!.p95 - f[k]!.p05

describe('project', () => {
  it('starts at today\'s figure, a day a point to the horizon, the bands in order', () => {
    const input = stored(ou)
    const f = project(input)
    expect(f).toHaveLength(HORIZON_DAYS + 1)
    expect(f[0]!.p50).toBe(input.level[input.level.length - 1])
    expect(f[1]!.ms - f[0]!.ms).toBe(DAY)
    for (const p of f) {
      expect(p.p05).toBeLessThanOrEqual(p.p25)
      expect(p.p25).toBeLessThanOrEqual(p.p50)
      expect(p.p50).toBeLessThanOrEqual(p.p75)
      expect(p.p75).toBeLessThanOrEqual(p.p95)
    }
  })

  it('is the same fan for the same row, every time', () => {
    expect(project(stored(jump))).toEqual(project(stored(jump)))
  })

  it('levels off for a mean-reverting row and keeps opening for a drifting one', () => {
    const o = project(stored(ou))
    const d = project(stored(drift))
    // Day 30 over day 15: OU's variance saturates, a walk's grows with time (√2).
    expect(width(o, 30) / width(o, 15)).toBeLessThan(1.2)
    expect(width(d, 30) / width(d, 15)).toBeGreaterThan(1.3)
  })

  it('pulls a mean-reverting median back toward its mean, times the factor', () => {
    const input = stored(ou)
    const f = project(input)
    const today = input.level[input.level.length - 1]!
    const target = 100 * 1.1
    expect(Math.abs(f[30]!.p50 - target)).toBeLessThan(Math.abs(today - target) + 0.5)
  })

  it('follows the seasonal cosine forward, and gives the jump row fatter tails', () => {
    const s = project(stored(seasonal))
    expect(s[30]!.p50).not.toBeCloseTo(s[0]!.p50, 0)
    const j = project(stored(jump))
    const tail = (j[30]!.p95 - j[30]!.p75) / (j[30]!.p75 - j[30]!.p50)
    expect(tail).toBeGreaterThan(1.3) // a normal's is about 1.44; jumps push it out
  })

  it('draws nothing without a history', () => {
    expect(project({ process: ou, baseLevel: 100, dates: [], level: [] })).toEqual([])
  })
})

describe('fanExtent', () => {
  it('reaches the latest day and the widest band', () => {
    const f = project(stored(drift))
    const e = fanExtent([f])!
    expect(e.toMs).toBe(f[f.length - 1]!.ms)
    expect(e.lo).toBe(Math.min(...f.map(p => p.p05)))
    expect(fanExtent([])).toBeNull()
  })
})
