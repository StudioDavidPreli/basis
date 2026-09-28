import { param, type Adapter } from './types'

const BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

function compact(date: string): string {
  return date.replaceAll('-', '')
}

// Water level at one station. The latest reading is the 6-minute product;
// history is `hourly_height` (365 days per request allowed, fetched in
// 30-day chunks to keep each response small) averaged by day here. `t` is
// `YYYY-MM-DD HH:MM` in GMT; the adapter converts it to ISO.
//
// `hourly_height` is verified data, published a month at a time: on
// 2026-09-28 it ended at 2026-08-31, and any range inside the lag answers
// "No data was found". A range that reaches into the last RECENT_DAYS asks
// for `water_level` instead, the preliminary 6-minute series, which exists
// up to now and is capped at 31 days per request
// (decisions/2026-09-28-noaa-recent-water-level.md). The trailing window
// is 30 days, so each daily re-fetch spans the whole lag and the chart
// shades it provisional, which preliminary data is.
const RECENT_DAYS = 62

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
}
export const noaaCoops: Adapter = {
  id: 'noaa-coops',
  provider: 'NOAA CO-OPS',
  cadence: 'minutes',
  ttlMs: 1_800_000,
  historyDepthDays: 730,
  historyChunkDays: 30,
  trailingDays: 30,
  fixtures: { latest: 'noaa-tides-latest-2026-09-16.json', range: 'noaa-tides-range-2026-09-16.json' },
  latestUrl: p =>
    `${BASE}?date=latest&station=${param(p, 'station')}&product=water_level&datum=${param(p, 'datum')}&units=metric&time_zone=gmt&format=json`,
  rangeUrl: (p, from, to, today) => {
    const product = today !== undefined && to > daysBefore(today, RECENT_DAYS) ? 'water_level' : 'hourly_height'
    return `${BASE}?begin_date=${compact(from)}&end_date=${compact(to)}&station=${param(p, 'station')}&product=${product}&datum=${param(p, 'datum')}&units=metric&time_zone=gmt&format=json`
  },
  parseLatest(text) {
    const j = JSON.parse(text) as { data?: Array<{ t: string; v: string }>; error?: { message: string } }
    const row = j.data?.[0]
    if (!row || row.v === '') throw new Error(`noaa-coops: ${j.error?.message ?? 'empty data'}`)
    return { value: Number(row.v), asOf: `${row.t.replace(' ', 'T')}:00Z` }
  },
  parseRange(text) {
    const j = JSON.parse(text) as { data?: Array<{ t: string; v: string }>; error?: { message: string } }
    if (!j.data) throw new Error(`noaa-coops: ${j.error?.message ?? 'empty data'}`)
    const sums = new Map<string, { sum: number; n: number }>()
    for (const row of j.data) {
      if (row.v === '') continue
      const date = row.t.slice(0, 10)
      const s = sums.get(date) ?? { sum: 0, n: 0 }
      s.sum += Number(row.v)
      s.n += 1
      sums.set(date, s)
    }
    return [...sums.entries()].map(([d, s]) => [d, s.sum / s.n] as [string, number]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
  },
}
