import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { adapters } from './index'
import { config } from '@/lib/config'

// Every adapter's parser runs on its recorded fixture, the same bytes the
// live path would parse. asOf comes from the payload in the form the
// sources doc records per provider; never a time we attach.

const FIXTURES = path.resolve(__dirname, '../public/fixtures')
const load = (name: string) => readFile(path.join(FIXTURES, name), 'utf8')

function paramsFor(adapterId: string) {
  return Object.values(config.drivers).find(d => d.adapter === adapterId)!.params
}

describe('adapters', () => {
  it('every driver in the config names a real adapter with both fixtures on disk', async () => {
    for (const d of Object.values(config.drivers)) {
      const a = adapters[d.adapter]
      expect(a, d.adapter).toBeDefined()
      await expect(load(a!.fixtures.latest)).resolves.toBeTruthy()
      await expect(load(a!.fixtures.range)).resolves.toBeTruthy()
    }
  })

  it('frankfurter: rate and a date-only asOf', async () => {
    const a = adapters['frankfurter']!
    const p = paramsFor('frankfurter')
    expect(a.parseLatest(await load(a.fixtures.latest), p)).toEqual({ value: 1.1537, asOf: '2026-09-16' })
    const range = a.parseRange(await load(a.fixtures.range), p)
    expect(range[0]).toEqual(['2026-06-01', 1.1646])
    expect(range.length).toBeGreaterThan(70)
    expect(a.latestUrl(p)).toBe('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD')
  })

  it('open-meteo: current temperature with a Z appended, daily means with nulls dropped', async () => {
    const a = adapters['open-meteo']!
    const p = paramsFor('open-meteo')
    expect(a.parseLatest(await load(a.fixtures.latest), p)).toEqual({ value: 23.5, asOf: '2026-09-16T16:15:00Z' })
    const range = a.parseRange(await load(a.fixtures.range), p)
    expect(range).toHaveLength(106)
    expect(range[0]).toEqual(['2026-06-01', expect.any(Number)])
  })

  it('usgs: the feed count with generated as asOf, and the CSV binned by day', async () => {
    const a = adapters['usgs']!
    const p = paramsFor('usgs')
    const latest = a.parseLatest(await load(a.fixtures.latest), p)
    expect(latest.value).toBe(31)
    expect(latest.asOf).toBe(new Date(1789575929000).toISOString())
    const range = a.parseRange(await load(a.fixtures.range), p)
    expect(range.length).toBeGreaterThanOrEqual(13)
    expect(range.every(([, n]) => Number.isInteger(n) && n > 0)).toBe(true)
    // 926 events over 14 days; the GeoJSON pull minutes earlier had 925, the
    // catalogue grew by one between the two requests.
    expect(range.reduce((s, [, n]) => s + n, 0)).toBe(926)
  })

  it('noaa-coops: the latest reading as a number with an ISO asOf, hourly heights averaged by day', async () => {
    const a = adapters['noaa-coops']!
    const p = paramsFor('noaa-coops')
    expect(a.parseLatest(await load(a.fixtures.latest), p)).toEqual({ value: 1.587, asOf: '2026-09-16T16:18:00Z' })
    const range = a.parseRange(await load(a.fixtures.range), p)
    expect(range[0]![0]).toBe('2026-06-01')
    // 108 days requested, 92 with readings: the station has gaps.
    expect(range.length).toBe(92)
    expect(range.every(([, v]) => v > -1 && v < 4)).toBe(true)
  })
})
