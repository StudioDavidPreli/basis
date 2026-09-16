import { describe, it, expect } from 'vitest'
import { entityDetail, entityHref } from './entity-detail'
import type { StoredSnapshot } from '@/worker/refresh'
import type { FigureValue, Mutation, Source } from './types'

const source: Source = { kind: 'api', provider: 'Open-Meteo', ref: 'Tokyo temperature', asOf: '2026-09-15', cadence: 'hourly', ttlMs: 3_600_000 }
const figure = (value: number): FigureValue => ({ value, source, status: 'current', updatedAt: '2026-09-16T10:00:00Z' })
const mutation = (entity: string, at: string, value: number): Mutation => ({ entity, metric: 'level', prev: value - 1, value, sources: [source], at })

const snapshot: StoredSnapshot = {
  at: '2026-09-16T10:00:00Z',
  entities: {
    'ou-tokyo': { metrics: { level: figure(101), change: figure(12), multiple: figure(12.6) } },
    brooklyn: { metrics: { index: figure(99), change: figure(-3), driver: figure(21) } },
  },
  mutations: [
    mutation('ou-tokyo', '2026-09-16T10:00:00Z', 101),
    mutation('brooklyn', '2026-09-16T10:00:00Z', 99),
    mutation('ou-tokyo', '2026-09-16T09:45:00Z', 100),
    mutation('ou-tokyo', '2026-09-16T09:30:00Z', 99),
    mutation('ou-tokyo', '2026-09-16T09:15:00Z', 98),
  ],
  agent: { phase: 'done', progress: 1, startedAt: '2026-09-16T10:00:00Z', finishedAt: '2026-09-16T10:00:01Z', lastSuccessAt: '2026-09-16T10:00:01Z', interruption: null },
}

describe('entityDetail', () => {
  it('is null for an unknown id', () => {
    expect(entityDetail('nope', snapshot)).toBeNull()
  })

  it('assembles a company from the config and the snapshot', () => {
    const d = entityDetail('ou-tokyo', snapshot)!
    expect(d.kind).toBe('company')
    expect(d.dataset).toBe('comps')
    expect(d.name).toBe('Anchor Kaze')
    expect(d.about).toMatch(/^Anchor Kaze is a reinsurance company/)
    expect(d.description).toMatch(/mean-reverting/)
    expect(d.columns.map(c => c.key)).toEqual(['level', 'change', 'multiple'])
    expect(d.metrics['level']?.value).toBe(101)
    expect(d.inputs.map(i => i.driver)).toEqual(['temp-tokyo', 'fx'])
    expect(d.inputs[0]!.dominant).toBe(true)
    expect(d.parentheses).toBe(true)
    expect(d.at).toBe(snapshot.at)
  })

  it('keeps the last three mutations for the entity, newest first', () => {
    const d = entityDetail('ou-tokyo', snapshot)!
    expect(d.mutations.map(m => m.at)).toEqual(['2026-09-16T10:00:00Z', '2026-09-16T09:45:00Z', '2026-09-16T09:30:00Z'])
    expect(d.mutations.every(m => m.entity === 'ou-tokyo')).toBe(true)
  })

  it('assembles a region, whose table columns include the driver', () => {
    const d = entityDetail('brooklyn', snapshot)!
    expect(d.kind).toBe('region')
    expect(d.name).toBe('Brooklyn')
    expect(d.columns.map(c => c.key)).toEqual(['index', 'change', 'driver'])
    expect(d.inputs).toHaveLength(1)
    expect(d.parentheses).toBe(false)
    expect(d.mutations).toHaveLength(1)
  })

  it('renders with no snapshot: every metric absent, nothing invented', () => {
    const d = entityDetail('ou-tokyo', null)!
    expect(d.metrics).toEqual({})
    expect(d.mutations).toEqual([])
    expect(d.at).toBeNull()
  })

  it('routes companies and regions to their own paths', () => {
    expect(entityHref('ou-tokyo')).toBe('/company/ou-tokyo')
    expect(entityHref('brooklyn')).toBe('/region/brooklyn')
  })
})
