import { param, type Adapter } from './types'

// One adapter, two hosts: the forecast host for the current reading, the
// archive host for daily means. `current.time` arrives as UTC with no zone
// suffix; the adapter appends `Z`. The archive returns provisional values
// through today, so the trailing week is re-fetched daily.
export const openMeteo: Adapter = {
  id: 'open-meteo',
  provider: 'Open-Meteo',
  cadence: 'hourly',
  ttlMs: 7_200_000,
  historyDepthDays: 1826,
  historyChunkDays: 1826,
  trailingDays: 7,
  fixtures: { latest: 'openmeteo-current-2026-09-16.json', range: 'openmeteo-archive-2026-09-16.json' },
  latestUrl: p =>
    `https://api.open-meteo.com/v1/forecast?latitude=${param(p, 'latitude')}&longitude=${param(p, 'longitude')}&current=temperature_2m&timezone=UTC`,
  rangeUrl: (p, from, to) =>
    `https://archive-api.open-meteo.com/v1/archive?latitude=${param(p, 'latitude')}&longitude=${param(p, 'longitude')}&start_date=${from}&end_date=${to}&daily=temperature_2m_mean&timezone=UTC`,
  parseLatest(text) {
    const j = JSON.parse(text) as { current: { time: string; temperature_2m: number } }
    if (typeof j.current?.temperature_2m !== 'number') throw new Error('open-meteo: no current temperature')
    return { value: j.current.temperature_2m, asOf: `${j.current.time}:00Z` }
  },
  parseRange(text) {
    const j = JSON.parse(text) as { daily: { time: string[]; temperature_2m_mean: Array<number | null> } }
    const out: Array<[string, number]> = []
    j.daily.time.forEach((date, i) => {
      const v = j.daily.temperature_2m_mean[i]
      if (typeof v === 'number') out.push([date, v])
    })
    return out
  },
}
