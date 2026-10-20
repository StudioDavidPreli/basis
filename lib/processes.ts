// The four base-series generators (docs/spec.md, "Simulation"). Each is a
// pure function from a process config and a list of dates to one number per
// date. The dates come from the driver's real history, so the base is
// replayed over real-dated steps and the chart's x axis is never invented.
//
// One step is one date, whatever the spacing. A business-daily driver gives
// business-daily steps; the parameters are "per step" and say so in the
// description template.

import { gaussian, mulberry32 } from './random'
import type { ProcessConfig, SeasonalProcess } from './config'

// No series goes below a twentieth of base. A random walk over five years
// can in principle cross zero, and a negative level would make the bps
// change and the multiple meaningless. The floor is a rule, not a
// parameter, so it is here and not in the config.
const FLOOR_FRACTION = 0.05

function dayOfYear(iso: string): number {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''))
  const start = Date.UTC(d.getUTCFullYear(), 0, 1)
  return (d.getTime() - start) / 86400000
}

// Seasonal is the one family that reads the date: the value is a cosine over
// the year, peaking at `phase` (a fraction of the year, 0.57 is late July),
// plus AR(1) noise so consecutive days are correlated rather than a hiss.
function seasonalAt(p: SeasonalProcess, base: number, date: string, noise: number): number {
  const angle = 2 * Math.PI * (dayOfYear(date) / p.period - p.phase)
  return base + p.amplitude * Math.cos(angle) + noise
}

// One process's state between steps: the level, and the seasonal family's
// AR(1) noise. The generator and the projection (lib/projection.ts) step
// the same state the same way, so a fan is the process the base came from.
export type ProcessState = { x: number; noise: number }

// One step on one date. `g` is the step's gaussian, drawn first by the
// caller; the jump family then draws its own uniforms from `rng`, so the
// draws come in the order the generator has always made them.
export function step(process: ProcessConfig, s: ProcessState, first: boolean, date: string, base: number, g: number, rng: () => number): void {
  switch (process.family) {
    case 'ou':
      // Mean-reverting: each step pulls a fraction theta of the way back
      // to mu, then adds noise. Starts at mu.
      if (first) s.x = process.mu
      else s.x = s.x + process.theta * (process.mu - s.x) + process.sigma * g
      break
    case 'drift':
      // Random walk with drift: a constant step plus noise, no memory.
      if (!first) s.x = s.x + process.mu + process.sigma * g
      break
    case 'seasonal':
      s.noise = 0.8 * s.noise + process.sigma * g
      s.x = seasonalAt(process, base, date, s.noise)
      break
    case 'jump':
      // Diffusion plus a Poisson-ish jump: with probability lambda per
      // step, a jump of jumpSize scaled by 0.5..1.5 in a random direction.
      if (!first) {
        s.x = s.x + process.sigma * g
        if (rng() < process.lambda) {
          const sign = rng() < 0.5 ? -1 : 1
          s.x = s.x + sign * process.jumpSize * (0.5 + rng())
        }
      }
      break
  }
  s.x = Math.max(s.x, base * FLOOR_FRACTION)
}

// The base over the dates, and the state it ends in.
export function generateWithState(process: ProcessConfig, dates: string[], base: number): { values: number[]; state: ProcessState } {
  const rng = mulberry32(process.seed)
  const s: ProcessState = { x: base, noise: 0 }
  const values: number[] = []
  for (let i = 0; i < dates.length; i++) {
    step(process, s, i === 0, dates[i]!, base, gaussian(rng), rng)
    values.push(s.x)
  }
  return { values, state: s }
}

export function generate(process: ProcessConfig, dates: string[], base: number): number[] {
  return generateWithState(process, dates, base).values
}
