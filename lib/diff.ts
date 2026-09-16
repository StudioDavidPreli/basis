// Two snapshots in, the mutations between them out (docs/spec.md, "The
// refresh cycle"). A mutation is one metric of one entity whose value
// changed, carrying every source the new value rests on, so the live region
// can say "EV/EBITDA for Keel London updated to 12.4x from 11.9x, source US
// Treasury Fiscal Data" from the record alone.
//
// Pure: no clock, no KV. The handler (M3) supplies both snapshots and stores
// the result.

import type { Mutation, Snapshot, Source } from './types'

// Floating-point recomputation of an unchanged input can differ in the last
// bit. Below this, nothing changed.
const EPSILON = 1e-9

export function sourcesOf(source: Source | Source[]): Source[] {
  return Array.isArray(source) ? source : [source]
}

export function diff(prev: Snapshot | null, next: Snapshot): Mutation[] {
  const out: Mutation[] = []
  if (!prev) return out
  for (const [entity, snap] of Object.entries(next.entities)) {
    const before = prev.entities[entity]
    if (!before) continue
    for (const [metric, figure] of Object.entries(snap.metrics)) {
      const old = before.metrics[metric]
      if (!old) continue
      if (Math.abs(figure.value - old.value) <= EPSILON) continue
      out.push({
        entity,
        metric,
        prev: old.value,
        value: figure.value,
        sources: sourcesOf(figure.source),
        at: next.at,
      })
    }
  }
  return out
}
