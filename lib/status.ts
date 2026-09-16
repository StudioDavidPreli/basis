// The Figure status rules from docs/spec.md, derived and never set by hand.
// Order matters: the spec lists them by precedence.
//
//   refreshing    a fetch for any input is in flight (the reader derives
//                 this from the agent phase; the handler never writes it)
//   stale         any input past its ttl, or served from fixture
//   agent-updated value changed in the last completed run
//   unverified    generated with no live driver
//   current       otherwise

import type { FigureStatus, Source } from './types'

export type StatusInputs = {
  sources: Source[]
  changed: boolean
  now: Date
}

// A date-only asOf ("2026-09-16") is read as midnight UTC of that day; the
// business-daily TTLs are sized for that.
export function asOfMs(asOf: string): number {
  return Date.parse(asOf.length === 10 ? `${asOf}T00:00:00Z` : asOf)
}

export function isExpired(source: Source, now: Date): boolean {
  const t = asOfMs(source.asOf)
  return !Number.isFinite(t) || t + source.ttlMs < now.getTime()
}

export function deriveStatus({ sources, changed, now }: StatusInputs): FigureStatus {
  const live = sources.filter(s => s.kind === 'api')
  if (sources.some(s => s.fixture) || live.some(s => isExpired(s, now))) return 'stale'
  if (changed) return 'agent-updated'
  if (live.length === 0) return 'unverified'
  return 'current'
}
