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

export function generate(process: ProcessConfig, dates: string[], base: number): number[] {
  const rng = mulberry32(process.seed)
  const floor = base * FLOOR_FRACTION
  const out: number[] = []
  let x = base
  let noise = 0

  for (let i = 0; i < dates.length; i++) {
    const g = gaussian(rng)
    switch (process.family) {
      case 'ou':
        // Mean-reverting: each step pulls a fraction theta of the way back
        // to mu, then adds noise. Starts at mu.
        if (i === 0) x = process.mu
        else x = x + process.theta * (process.mu - x) + process.sigma * g
        break
      case 'drift':
        // Random walk with drift: a constant step plus noise, no memory.
        if (i > 0) x = x + process.mu + process.sigma * g
        break
      case 'seasonal':
        noise = 0.8 * noise + process.sigma * g
        x = seasonalAt(process, base, dates[i]!, noise)
        break
      case 'jump':
        // Diffusion plus a Poisson-ish jump: with probability lambda per
        // step, a jump of jumpSize scaled by 0.5..1.5 in a random direction.
        if (i > 0) {
          x = x + process.sigma * g
          if (rng() < process.lambda) {
            const sign = rng() < 0.5 ? -1 : 1
            x = x + sign * process.jumpSize * (0.5 + rng())
          }
        }
        break
    }
    x = Math.max(x, floor)
    out.push(x)
  }
  return out
}
