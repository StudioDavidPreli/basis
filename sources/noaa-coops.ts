import { param, type Adapter } from './types'

const BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'

function compact(date: string): string {
  return date.replaceAll('-', '')
}

// Water level at one station. The latest reading is the 6-minute product;
// history is `hourly_height` (365 days per request allowed, fetched in
// 30-day chunks to keep each response small) averaged by day here. `t` is
// `YYYY-MM-DD HH:MM` in GMT; the adapter converts it to ISO.
export const noaaCoops: Adapter = {
  id: 'noaa-coops',
  provider: 'NOAA CO-OPS',
  cadence: 'minutes',
  ttlMs: 1_800_000,
  historyDepthDays: 730,
  historyChunkDays: 30,
  trailingDays: 3,
  fixtures: { latest: 'noaa-tides-latest-2026-09-16.json', range: 'noaa-tides-range-2026-09-16.json' },
  latestUrl: p =>
    `${BASE}?date=latest&station=${param(p, 'station')}&product=water_level&datum=${param(p, 'datum')}&units=metric&time_zone=gmt&format=json`,
  rangeUrl: (p, from, to) =>
    `${BASE}?begin_date=${compact(from)}&end_date=${compact(to)}&station=${param(p, 'station')}&product=hourly_height&datum=${param(p, 'datum')}&units=metric&time_zone=gmt&format=json`,
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
