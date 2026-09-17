import { describe, it, expect } from 'vitest'
import { endpoint, seriesFor } from './series'
import type { ColumnConfig } from './config'
import type { EntitySeries } from './types'

const entity: EntitySeries = {
  dates: ['2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16'],
  level: [100, 101, 99, 102],
  driver: [20, 21, 19, 22],
  coveredFrom: '2026-09-13',
  provisionalFrom: '2026-09-09',
}

const col = (partial: Partial<ColumnConfig> & Pick<ColumnConfig, 'derive'>): ColumnConfig => ({
  key: partial.derive,
  label: partial.derive,
  format: 'number',
  ...partial,
})

describe('seriesFor', () => {
  it('level is the stored level, one point per date', () => {
    expect(seriesFor(entity, col({ derive: 'level' }))).toEqual([
      ['2026-09-13', 100],
      ['2026-09-14', 101],
      ['2026-09-15', 99],
      ['2026-09-16', 102],
    ])
  })

  it('deltaBps derives from the previous point and has no first point', () => {
    const points = seriesFor(entity, col({ derive: 'deltaBps' }))
    expect(points.map(p => p[0])).toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
    expect(points[0]![1]).toBeCloseTo(100, 6)
    expect(points[2]![1]).toBeCloseTo(((102 - 99) / 99) * 10_000, 6)
  })

  it('ratio divides the level by the column divisor', () => {
    expect(seriesFor(entity, col({ derive: 'ratio', divisor: 8 })).map(p => p[1])).toEqual([12.5, 12.625, 12.375, 12.75])
  })

  it("driver is the dominant driver's own history, and empty when none is stored", () => {
    expect(seriesFor(entity, col({ derive: 'driver' })).map(p => p[1])).toEqual([20, 21, 19, 22])
    expect(seriesFor({ ...entity, driver: undefined }, col({ derive: 'driver' }))).toEqual([])
  })

  it('a field column charts nothing', () => {
    expect(seriesFor(entity, col({ derive: 'field', field: 'industry', format: 'text' }))).toEqual([])
  })

  it('the endpoint is the last point', () => {
    expect(endpoint(entity, col({ derive: 'level' }))).toEqual(['2026-09-16', 102])
    expect(endpoint({ ...entity, dates: [], level: [] }, col({ derive: 'level' }))).toBeNull()
  })
})
