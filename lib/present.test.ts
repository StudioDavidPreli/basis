import { describe, it, expect } from 'vitest'
import { present, ageLabel } from './present'
import type { FigureValue, Source } from './types'

const NOW = new Date('2026-09-16T16:30:00Z')
const meteo: Source = {
  kind: 'api',
  provider: 'Open-Meteo',
  ref: '2 m air temperature at Tokyo',
  url: 'https://api.open-meteo.com/v1/forecast',
  asOf: '2026-09-16T16:15:00Z',
  cadence: 'hourly',
  ttlMs: 7_200_000,
}
const fx: Source = { ...meteo, provider: 'Frankfurter', ref: 'ECB EUR/USD', asOf: '2026-09-16', cadence: 'business-daily', ttlMs: 259_200_000 }

function figure(over: Partial<FigureValue> = {}): FigureValue {
  return { value: 101.2, source: [meteo, fx], status: 'current', updatedAt: NOW.toISOString(), ...over }
}

describe('present', () => {
  it('current stays current with fresh sources', () => {
    expect(present(figure(), 'done', NOW).status).toBe('current')
  })

  it('refreshing outranks everything while the agent reads or builds', () => {
    expect(present(figure({ status: 'agent-updated', prev: 100 }), 'reading', NOW).status).toBe('refreshing')
    expect(present(figure(), 'building', NOW).status).toBe('refreshing')
  })

  it('a figure written current goes stale once its oldest source passes its TTL, with an age', () => {
    const later = new Date('2026-09-16T19:00:00Z') // 2h45 after the hourly reading
    const p = present(figure(), 'done', later)
    expect(p.status).toBe('stale')
    expect(p.age).toBe('3 h ago')
  })

  it('a fixture-served source is stale whatever the clock says', () => {
    const p = present(figure({ source: [{ ...meteo, fixture: true }, fx] }), 'done', NOW)
    expect(p.status).toBe('stale')
  })

  it('agent-updated carries a direction from prev', () => {
    expect(present(figure({ status: 'agent-updated', prev: 100 }), 'done', NOW).direction).toBe('up')
    expect(present(figure({ status: 'agent-updated', prev: 102 }), 'done', NOW).direction).toBe('down')
    expect(present(figure({ status: 'current' }), 'done', NOW).direction).toBeNull()
  })

  it('ageLabel picks the unit and reads a date-only asOf as midnight UTC', () => {
    expect(ageLabel('2026-09-16T16:00:00Z', NOW)).toBe('30 min ago')
    expect(ageLabel('2026-09-16T10:00:00Z', NOW)).toBe('7 h ago')
    expect(ageLabel('2026-09-10', NOW)).toBe('7 d ago')
  })
})
