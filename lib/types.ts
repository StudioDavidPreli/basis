// The data model from docs/spec.md, as types. Nothing here does anything;
// every module under lib/ reads these and stays pure.

export type Cadence = 'minutes' | 'hourly' | 'daily' | 'business-daily'

export type Source = {
  kind: 'api' | 'derived' | 'generated'
  provider: string // 'Frankfurter', 'Open-Meteo', …
  ref: string // human label: 'ECB EUR/USD reference rate'
  url?: string // the actual request, openable
  asOf: string // ISO date or timestamp from the provider, not from us
  cadence: Cadence
  ttlMs: number
  fixture?: true // served from the recorded fixture, never live; status rules read it
}

export type FigureStatus = 'current' | 'stale' | 'refreshing' | 'agent-updated' | 'unverified'

export type FigureValue = {
  value: number
  prev?: number
  source: Source | Source[] // derived values list every input
  status: FigureStatus
  updatedAt: string // when Basis wrote it
}

export type MetricKey = string

export type Series = Array<[date: string, value: number]>

// One refresh's output, the unit the diff compares and KV stores (M3).
export type Snapshot = {
  at: string
  entities: Record<string, EntitySnapshot>
}

export type EntitySnapshot = {
  metrics: Record<MetricKey, FigureValue>
}

// The chart's data, one KV key per dataset beside the snapshot
// (decisions/2026-09-16-series-in-their-own-key.md). The level is stored
// once per date; the other metrics derive from it per point (lib/series.ts).
export type EntitySeries = {
  dates: string[] // the dominant driver's real dates, ascending; the last is today
  level: number[] // one per date; the last equals the row's level figure
  driver?: number[] // the dominant driver's value per date; absent in a series stored before 2026-10-19
  coveredFrom: string | null // how deep the backfill has reached; null while on fixture
  provisionalFrom: string // dates on or after this may still be revised by the source
}

export type SeriesSnapshot = {
  at: string
  dataset: string
  entities: Record<string, EntitySeries>
}

export type Mutation = {
  entity: string
  metric: MetricKey
  prev: number
  value: number
  sources: Source[]
  at: string
}
