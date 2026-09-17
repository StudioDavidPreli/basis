// A dataset's columns say how each metric derives from an entity's level
// series and its dominant driver (data/companies.json, datasets.*.columns).
// This turns one column config plus the numbers into one value. Pure.

import type { ColumnConfig, CompanyConfig, RegionConfig } from './config'

export type MetricInputs = {
  level: number
  prevLevel: number | undefined
  driverValue: number | undefined // the dominant driver's latest raw value
  entity?: CompanyConfig | RegionConfig // only a `field` column reads it; the chart's per-point derivation passes none
}

export function deriveMetric(column: ColumnConfig, inputs: MetricInputs): number | string | undefined {
  switch (column.derive) {
    case 'level':
      return inputs.level
    case 'deltaBps':
      // Basis points of change from the previous level: 1 bps = 0.01%.
      if (inputs.prevLevel === undefined || inputs.prevLevel === 0) return undefined
      return ((inputs.level - inputs.prevLevel) / inputs.prevLevel) * 10_000
    case 'ratio':
      if (!column.divisor) throw new Error(`column ${column.key} derives a ratio without a divisor`)
      return inputs.level / column.divisor
    case 'driver':
      return inputs.driverValue
    case 'field': {
      if (!column.field) throw new Error(`column ${column.key} derives a field without naming it`)
      if (!inputs.entity) return undefined
      const v = (inputs.entity as unknown as Record<string, unknown>)[column.field]
      return typeof v === 'string' || typeof v === 'number' ? v : undefined
    }
  }
}
