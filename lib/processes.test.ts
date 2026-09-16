import { describe, it, expect } from 'vitest'
import { generate } from './processes'
import { mulberry32, gaussian } from './random'
import type { ProcessConfig } from './config'

// Business days from a start, as ISO dates. The generators take real dates
// from a driver; the tests need a plain list.
function dates(n: number, from = '2026-01-01'): string[] {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00Z')
  while (out.length < n) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

const OU: ProcessConfig = { family: 'ou', theta: 0.05, mu: 100, sigma: 1.5, seed: 1101 }
const DRIFT: ProcessConfig = { family: 'drift', mu: 0.02, sigma: 1.0, seed: 1201 }
const SEASONAL: ProcessConfig = { family: 'seasonal', amplitude: 8, period: 365, phase: 0.57, sigma: 0.8, seed: 1301 }
const JUMP: ProcessConfig = { family: 'jump', lambda: 0.03, jumpSize: 5, sigma: 0.8, seed: 1401 }

describe('random', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
  })

  it('gaussian has roughly zero mean and unit variance', () => {
    const rng = mulberry32(7)
    const xs = Array.from({ length: 20_000 }, () => gaussian(rng))
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length
    expect(Math.abs(mean)).toBeLessThan(0.03)
    expect(Math.abs(variance - 1)).toBeLessThan(0.05)
  })
})

describe('generate', () => {
  it('same seed, same series (M2 acceptance)', () => {
    for (const p of [OU, DRIFT, SEASONAL, JUMP]) {
      expect(generate(p, dates(300), 100)).toEqual(generate(p, dates(300), 100))
    }
  })

  it('different seed, different series', () => {
    expect(generate(OU, dates(50), 100)).not.toEqual(generate({ ...OU, seed: 1102 }, dates(50), 100))
  })

  it('returns one value per date, starting at base', () => {
    for (const p of [OU, DRIFT, JUMP]) {
      const s = generate(p, dates(120), 100)
      expect(s).toHaveLength(120)
      expect(s[0]).toBe(100)
    }
  })

  it('OU stays close to mu over a long run', () => {
    const s = generate(OU, dates(2000), 100)
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    expect(Math.abs(mean - 100)).toBeLessThan(2)
    // Stationary variance of a discrete OU is sigma^2 / (2 theta - theta^2);
    // the sample should sit within a wide band of that.
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)
    const expected = Math.sqrt(OU.sigma ** 2 / (2 * OU.theta - OU.theta ** 2))
    expect(sd).toBeGreaterThan(expected * 0.7)
    expect(sd).toBeLessThan(expected * 1.3)
  })

  it('drift moves in the direction of mu', () => {
    const up = generate(DRIFT, dates(1500), 100)
    const down = generate({ ...DRIFT, mu: -0.02 }, dates(1500), 100)
    expect(up[up.length - 1]!).toBeGreaterThan(100)
    expect(down[down.length - 1]!).toBeLessThan(100)
  })

  it('seasonal peaks near the phase and reads the date, not the index', () => {
    // Calendar days across a year; the max should land near day 0.57 * 365.
    const all: string[] = []
    const d = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 365; i++) {
      all.push(d.toISOString().slice(0, 10))
      d.setUTCDate(d.getUTCDate() + 1)
    }
    const s = generate({ ...SEASONAL, sigma: 0 }, all, 100)
    const peak = s.indexOf(Math.max(...s))
    expect(Math.abs(peak - 0.57 * 365)).toBeLessThan(2)
    expect(Math.max(...s)).toBeCloseTo(108, 0)
    expect(Math.min(...s)).toBeCloseTo(92, 0)
    // Same dates in a different order give the same values per date.
    const reversed = generate({ ...SEASONAL, sigma: 0 }, [...all].reverse(), 100)
    expect(reversed[0]).toBeCloseTo(s[s.length - 1]!, 6)
  })

  it('jump produces occasional steps larger than the diffusion could', () => {
    const s = generate(JUMP, dates(2000), 100)
    const steps = s.slice(1).map((v, i) => Math.abs(v - s[i]!))
    const big = steps.filter(x => x > JUMP.sigma * 4).length
    // lambda 0.03 over 2000 steps is about 60 jumps; well over a handful.
    expect(big).toBeGreaterThan(20)
  })

  it('never goes below a twentieth of base', () => {
    const s = generate({ family: 'drift', mu: -5, sigma: 10, seed: 1 }, dates(500), 100)
    expect(Math.min(...s)).toBeGreaterThanOrEqual(5)
  })
})
