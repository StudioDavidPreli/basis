// From a stored entity series to the points one column charts
// (decisions/2026-09-16-series-in-their-own-key.md). The key stores the
// level once per date and, for regions, the dominant driver's value; every
// other metric derives per point through the same rule the ledger's figure
// used (lib/metrics.ts), so the chart's endpoint and the row's figure cannot
// disagree. Pure.

import { deriveMetric } from './metrics'
import type { ColumnConfig } from './config'
import type { EntitySeries, Series } from './types'

export function seriesFor(entity: EntitySeries, column: ColumnConfig): Series {
  const out: Series = []
  for (let i = 0; i < entity.dates.length; i++) {
    const value = deriveMetric(column, {
      level: entity.level[i]!,
      prevLevel: i > 0 ? entity.level[i - 1] : undefined,
      driverValue: entity.driver?.[i],
    })
    if (typeof value === 'number' && Number.isFinite(value)) out.push([entity.dates[i]!, value])
  }
  return out
}

// The point the ledger shows: the last one, which the refresh wrote from
// today's readings.
export function endpoint(entity: EntitySeries, column: ColumnConfig): [date: string, value: number] | null {
  const points = seriesFor(entity, column)
  return points[points.length - 1] ?? null
}
