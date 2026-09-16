import { param, type Adapter } from './types'

// The value is a count: earthquakes at or above the configured magnitude in
// the trailing 24 hours, from the summary feed that regenerates each minute
// (`metadata.generated` is the asOf). History comes from the event query as
// CSV, binned by UTC day here: CSV is a fifth the size of GeoJSON, and a
// Worker's CPU budget is the constraint, not bandwidth.
export const usgs: Adapter = {
  id: 'usgs',
  provider: 'USGS',
  cadence: 'minutes',
  ttlMs: 1_800_000,
  historyDepthDays: 365,
  historyChunkDays: 30,
  trailingDays: 3,
  fixtures: { latest: 'usgs-feed-day-2026-09-16.json', range: 'usgs-query-range-2026-09-16.csv' },
  latestUrl: p => `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${param(p, 'minMagnitude')}_day.geojson`,
  rangeUrl: (p, from, to) =>
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=${from}&endtime=${to}&minmagnitude=${param(p, 'minMagnitude')}&orderby=time-asc`,
  parseLatest(text) {
    const j = JSON.parse(text) as { metadata: { generated: number; count: number } }
    if (typeof j.metadata?.count !== 'number') throw new Error('usgs: no count in feed')
    return { value: j.metadata.count, asOf: new Date(j.metadata.generated).toISOString() }
  },
  parseRange(text) {
    const lines = text.split('\n')
    const header = lines[0]?.split(',') ?? []
    const timeIndex = header.indexOf('time')
    if (timeIndex < 0) throw new Error('usgs: csv has no time column')
    const counts = new Map<string, number>()
    for (const line of lines.slice(1)) {
      if (!line) continue
      const date = line.split(',')[timeIndex]?.slice(0, 10)
      if (date) counts.set(date, (counts.get(date) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  },
}
