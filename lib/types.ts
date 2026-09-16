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

export type Mutation = {
  entity: string
  metric: MetricKey
  prev: number
  value: number
  sources: Source[]
  at: string
}
