// One shape for every source adapter (docs/sources.md, "Per-source adapter
// requirements"). An adapter is pure over text: it builds URLs and parses
// response bodies. It never fetches. The refresh handler owns the network,
// the fixture fallback, and the clock, so a test can run every adapter on
// its recorded fixture and the handler on an in-memory KV.

import type { Cadence } from '@/lib/types'

export type Params = Record<string, string | number>

export type Adapter = {
  id: string
  provider: string
  cadence: Cadence
  ttlMs: number
  // History policy. The backfill runs backwards from today in chunks of
  // `historyChunkDays` until `historyDepthDays` is covered, one chunk per
  // driver per run inside the request budget; the trailing `trailingDays`
  // are re-fetched once a day so provisional values get revised.
  historyDepthDays: number
  historyChunkDays: number
  trailingDays: number
  // Recorded responses under public/fixtures/, served by the assets binding
  // on the Worker and read from disk in tests.
  fixtures: { latest: string; range: string }
  latestUrl(params: Params): string
  // `today` is the handler's clock, passed in so the adapter stays pure;
  // an adapter whose product depends on how recent the range is reads it.
  rangeUrl(params: Params, from: string, to: string, today?: string): string
  parseLatest(text: string, params: Params): { value: number; asOf: string }
  parseRange(text: string, params: Params): Array<[date: string, value: number]>
}

export function param(params: Params, key: string): string {
  const v = params[key]
  if (v === undefined) throw new Error(`adapter needs param ${key}`)
  return String(v)
}
