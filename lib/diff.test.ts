import { describe, it, expect } from 'vitest'
import { diff } from './diff'
import type { Snapshot, Source } from './types'

const meteo: Source = {
  kind: 'api',
  provider: 'Open-Meteo',
  ref: '2 m air temperature at London',
  url: 'https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=-0.13&current=temperature_2m',
  asOf: '2026-09-16T16:00Z',
  cadence: 'hourly',
  ttlMs: 7_200_000,
}
const treasury: Source = {
  kind: 'api',
  provider: 'US Treasury Fiscal Data',
  ref: 'Debt to the Penny, total public debt outstanding',
  url: 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1',
  asOf: '2026-09-14',
  cadence: 'business-daily',
  ttlMs: 259_200_000,
}

function snapshot(at: string, level: number, multiple: number): Snapshot {
  return {
    at,
    entities: {
      'ou-london': {
        metrics: {
          level: { value: level, source: [meteo, treasury], status: 'current', updatedAt: at },
          multiple: { value: multiple, source: [meteo, treasury], status: 'current', updatedAt: at },
        },
      },
    },
  }
}

describe('diff', () => {
  it('yields nothing against no previous snapshot', () => {
    expect(diff(null, snapshot('2026-09-16T16:15Z', 101, 12.6))).toEqual([])
  })

  it('yields one mutation per changed metric, carrying every source (M2 acceptance)', () => {
    const prev = snapshot('2026-09-16T16:00Z', 100, 12.5)
    const next = snapshot('2026-09-16T16:15Z', 101.2, 12.5)
    const out = diff(prev, next)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      entity: 'ou-london',
      metric: 'level',
      prev: 100,
      value: 101.2,
      sources: [meteo, treasury],
      at: '2026-09-16T16:15Z',
    })
  })

  it('ignores a last-bit float difference', () => {
    const prev = snapshot('a', 0.1 + 0.2, 1)
    const next = snapshot('b', 0.3, 1)
    expect(diff(prev, next)).toEqual([])
  })

  it('skips entities and metrics the previous snapshot did not have', () => {
    const prev = snapshot('a', 100, 12.5)
    const next = snapshot('b', 100, 12.5)
    next.entities['jump-dubai'] = { metrics: { level: { value: 90, source: meteo, status: 'current', updatedAt: 'b' } } }
    next.entities['ou-london']!.metrics['change'] = { value: 5, source: meteo, status: 'current', updatedAt: 'b' }
    expect(diff(prev, next)).toEqual([])
  })
})
