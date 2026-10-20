// The projection fan (M12; decisions/2026-10-19-the-projection-runs-the-
// config-forward.md): a row's own base process run forward from today's
// state, many seeded paths, times today's driver factor, read off as the
// median and the 50% and 90% bands. The drivers are held where they are
// today; the fan says what the process alone would do. Pure.

import type { ProcessConfig } from './config'
import { generateWithState, step } from './processes'
import { gaussian, mulberry32 } from './random'

export const HORIZON_DAYS = 30
export const PATHS = 1000

const DAY = 86_400_000

export type FanPoint = { ms: number; p05: number; p25: number; p50: number; p75: number; p95: number }

export type FanInput = {
  process: ProcessConfig
  baseLevel: number // the config's base, the level the process is centred on
  dates: string[] // the stored series' dates, ascending; the last is today
  level: number[] // the stored Level, one per date; the last is today's figure
}

// Seeded from the row's own seed, set apart from the generator's stream so
// the fan is not the history replayed.
const FAN_SALT = 0x5eed

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}

// Today's point first, where every band is the figure itself, then one per
// day to the horizon. Empty when there is no history to start from.
export function project(input: FanInput, horizon: number = HORIZON_DAYS, paths: number = PATHS): FanPoint[] {
  const { process, baseLevel, dates, level } = input
  if (dates.length === 0 || level.length !== dates.length) return []
  const { values, state } = generateWithState(process, dates, baseLevel)
  const baseToday = values[values.length - 1]!
  const levelToday = level[level.length - 1]!
  if (!(baseToday > 0)) return []
  const factor = levelToday / baseToday
  const todayMs = Date.parse(dates[dates.length - 1]! + 'T00:00:00Z')
  const days = Array.from({ length: horizon }, (_, k) => isoDay(todayMs + (k + 1) * DAY))

  const samples: number[][] = days.map(() => new Array<number>(paths))
  const rng = mulberry32((process.seed ^ FAN_SALT) >>> 0)
  for (let p = 0; p < paths; p++) {
    const s = { ...state }
    for (let k = 0; k < horizon; k++) {
      step(process, s, false, days[k]!, baseLevel, gaussian(rng), rng)
      samples[k]![p] = s.x * factor
    }
  }

  const out: FanPoint[] = [{ ms: todayMs, p05: levelToday, p25: levelToday, p50: levelToday, p75: levelToday, p95: levelToday }]
  for (let k = 0; k < horizon; k++) {
    const sorted = samples[k]!.sort((a, b) => a - b)
    out.push({ ms: todayMs + (k + 1) * DAY, p05: quantile(sorted, 0.05), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), p95: quantile(sorted, 0.95) })
  }
  return out
}

// The fan's reach, for widening the chart's domain while it shows.
export function fanExtent(fans: FanPoint[][]): { toMs: number; lo: number; hi: number } | null {
  const all = fans.flat()
  if (all.length === 0) return null
  return { toMs: Math.max(...all.map(f => f.ms)), lo: Math.min(...all.map(f => f.p05)), hi: Math.max(...all.map(f => f.p95)) }
}
