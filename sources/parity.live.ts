import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { adapters } from './index'
import { config } from '@/lib/config'

// Fixture-vs-live parity (plan.md, M9). Every driver's live response goes
// through the same parser as its recorded fixture, and the two must agree
// in shape: a finite value, an asOf in the fixture's format, a range of
// strictly increasing dates in the fixture's format with finite values. A
// failure here means the provider changed or is down, and the fixture no
// longer stands for it. Reaches the network: `npm run test:live` only.

const FIXTURES = path.resolve(__dirname, '../public/fixtures')
const load = (name: string) => readFile(path.join(FIXTURES, name), 'utf8')

// The shape of a date string: every digit becomes 9, so "2026-09-16" and
// "2021-01-03" match and "2026-09-16T16:15:00Z" does not match either.
const shape = (s: string) => s.replace(/\d/g, '9')

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: 'application/json, text/csv' } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} from ${url}: ${text.slice(0, 200)}`)
  return text
}

const day = (d: Date) => d.toISOString().slice(0, 10)
const today = new Date()
const from = day(new Date(today.getTime() - 21 * 86_400_000))

describe('fixture-vs-live parity', () => {
  for (const [id, driver] of Object.entries(config.drivers)) {
    const a = adapters[driver.adapter]!
    describe(`${id} (${a.provider})`, () => {
      it('latest parses to the fixture’s shape', async () => {
        const fixture = a.parseLatest(await load(a.fixtures.latest), driver.params)
        const live = a.parseLatest(await get(a.latestUrl(driver.params)), driver.params)
        expect(Number.isFinite(live.value)).toBe(true)
        expect(shape(live.asOf)).toBe(shape(fixture.asOf))
      })

      it('the last three weeks parse to the fixture’s shape', async () => {
        const fixture = a.parseRange(await load(a.fixtures.range), driver.params)
        const live = a.parseRange(await get(a.rangeUrl(driver.params, from, day(today), day(today))), driver.params)
        expect(live.length).toBeGreaterThan(0)
        for (const [d, v] of live) {
          expect(shape(d)).toBe(shape(fixture[0]![0]))
          expect(Number.isFinite(v)).toBe(true)
        }
        for (let i = 1; i < live.length; i++) expect(live[i]![0] > live[i - 1]![0]).toBe(true)
      })
    })
  }
})
