import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { refresh, runRefresh, KEYS, type RefreshDeps, type StoredSnapshot } from './refresh'
import { config } from '@/lib/config'
import type { SeriesSnapshot } from '@/lib/types'
import { adapters } from '@/sources'
import { fixtureFetchFor } from './fixtureFetch'

// M3 acceptance, on fixtures only: a run writes a snapshot; a second run
// with one changed fixture value yields exactly the expected mutations; a
// failing adapter yields stale statuses and phase waiting, never a throw.
// The clock is fixed to a minute after the fixtures were recorded so every
// TTL holds in the "live" cases.

const NOW = new Date('2026-09-16T16:30:00Z')
const FIXTURES = path.resolve(__dirname, '../public/fixtures')

function memoryKv() {
  const store = new Map<string, string>()
  // The store is last-write-wins, so the agent key's intermediate phases are
  // invisible in it. The log keeps the order they were written in.
  const log: Array<[key: string, value: string]> = []
  let writes = 0
  return {
    store,
    log,
    get writes() {
      return writes
    },
    kv: {
      async get(key: string) {
        return store.get(key) ?? null
      },
      async put(key: string, value: string) {
        writes += 1
        log.push([key, value])
        store.set(key, value)
      },
    },
  }
}

// The phases written to the agent key, in order, with the progress each
// carried.
function phaseLog(mem: { log: Array<[string, string]> }): Array<[string, number]> {
  return mem.log.filter(([k]) => k === KEYS.agent).map(([, v]) => {
    const a = JSON.parse(v) as { phase: string; progress: number }
    return [a.phase, a.progress]
  })
}

const loadFixture = (name: string) => readFile(path.join(FIXTURES, name), 'utf8')

const fixtureFetch = (fail: (url: string) => boolean = () => false) => fixtureFetchFor(adapters, loadFixture, (_id, url) => fail(url))

function deps(partial: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    kv: memoryKv().kv,
    fetchText: async url => {
      throw new Error(`network call in fixtures-only mode: ${url}`)
    },
    loadFixture,
    now: () => NOW,
    fixturesOnly: true,
    config,
    ...partial,
  }
}

describe('refresh on fixtures', () => {
  it('writes a snapshot with every entity, every figure stale, phase done, no network', async () => {
    const mem = memoryKv()
    const result = await refresh(deps({ kv: mem.kv }))
    expect(result.phase).toBe('done')
    expect(result.requests).toBe(0)
    expect(Object.keys(result.snapshot.entities)).toHaveLength(20)
    const stored = JSON.parse(mem.store.get(KEYS.snapshot)!) as StoredSnapshot
    expect(stored.at).toBe(NOW.toISOString())
    for (const [id, entity] of Object.entries(stored.entities)) {
      const keys = Object.keys(entity.metrics)
      expect(keys, id).toEqual(id.includes('-') && !config.regions.some(r => r.id === id) ? ['level', 'change', 'multiple'] : ['index', 'change', 'driver'])
      for (const figure of Object.values(entity.metrics)) {
        expect(figure.status).toBe('stale')
        expect(Array.isArray(figure.source)).toBe(true)
        for (const s of figure.source as Array<{ fixture?: true; url?: string }>) {
          expect(s.fixture).toBe(true)
          expect(s.url).toMatch(/^https:\/\//)
        }
      }
    }
    // A company level starts near base scaled by today's readings; sanity.
    expect(stored.entities['ou-tokyo']!.metrics['level']!.value).toBeGreaterThan(50)
    expect(stored.entities['ou-tokyo']!.metrics['level']!.value).toBeLessThan(200)
  })

  it('a second run with one changed fixture value yields exactly the expected mutations', async () => {
    const mem = memoryKv()
    const first = deps({ kv: mem.kv })
    await refresh(first)
    const changedLoad = async (name: string) => {
      const text = await loadFixture(name)
      if (name === adapters['frankfurter']!.fixtures.latest) return text.replace('1.1537', '1.2537')
      return text
    }
    const second = await refresh(deps({ kv: mem.kv, loadFixture: changedLoad }))
    const pairs = second.mutations.map(m => `${m.entity}.${m.metric}`).sort()
    // The four fx-exposed companies, every numeric comps metric each.
    expect(pairs).toEqual(
      ['ou-tokyo', 'ou-london', 'drift-lagos', 'seasonal-berlin']
        .flatMap(id => ['level', 'change', 'multiple'].map(m => `${id}.${m}`))
        .sort(),
    )
    for (const m of second.mutations) {
      expect(m.prev).not.toBe(m.value)
      expect(m.sources.map(s => s.provider)).toContain('Frankfurter')
      expect(m.at).toBe(NOW.toISOString())
    }
    const stored = JSON.parse(mem.store.get(KEYS.snapshot)!) as StoredSnapshot
    expect(stored.mutations).toHaveLength(12)
    // Stale outranks agent-updated: the fixture rule wins on the status.
    expect(stored.entities['ou-tokyo']!.metrics['level']!.status).toBe('stale')
    expect(stored.entities['ou-tokyo']!.metrics['level']!.prev).toBeDefined()
  })

  it('writes one series key per dataset: real dates ending today, the endpoint equal to the figure', async () => {
    const mem = memoryKv()
    await refresh(deps({ kv: mem.kv }))
    const comps = JSON.parse(mem.store.get(KEYS.series('comps'))!) as SeriesSnapshot
    const regions = JSON.parse(mem.store.get(KEYS.series('regions'))!) as SeriesSnapshot
    const snapshot = JSON.parse(mem.store.get(KEYS.snapshot)!) as StoredSnapshot
    expect(comps.at).toBe(NOW.toISOString())
    expect(Object.keys(comps.entities)).toHaveLength(12)
    expect(Object.keys(regions.entities)).toHaveLength(8)
    for (const [id, s] of Object.entries({ ...comps.entities, ...regions.entities })) {
      expect(s.dates.length, id).toBe(s.level.length)
      expect(s.dates.length, id).toBeGreaterThan(10)
      for (let i = 1; i < s.dates.length; i++) expect(s.dates[i]! > s.dates[i - 1]!, `${id} ascending at ${i}`).toBe(true)
      expect(s.dates[s.dates.length - 1], id).toBe('2026-09-16')
      // The endpoint is the ledger's figure, to the stored precision.
      const level = snapshot.entities[id]!.metrics['level'] ?? snapshot.entities[id]!.metrics['index']
      expect(s.level[s.level.length - 1], id).toBeCloseTo(level!.value, 3)
      // Fixture history: covered from the fixture's first date.
      expect(s.coveredFrom, id).toBe(s.dates[0])
    }
    // A company on a daily driver: the archive ends 09-14 and today is
    // appended; provisional from seven days back (Open-Meteo's trailing
    // window). A region carries its driver's own history.
    const tokyo = comps.entities['ou-tokyo']!
    expect(tokyo.dates.slice(-2)).toEqual(['2026-09-14', '2026-09-16'])
    expect(tokyo.provisionalFrom).toBe('2026-09-09')
    expect(tokyo.driver).toBeUndefined()
    const brooklyn = regions.entities['brooklyn']!
    expect(brooklyn.driver).toHaveLength(brooklyn.dates.length)
    expect(brooklyn.driver![brooklyn.driver!.length - 1]).toBeCloseTo(snapshot.entities['brooklyn']!.metrics['driver']!.value, 3)
    // Six writes a run (agent reading, agent building, snapshot, two series
    // keys, agent done) plus the 23 fixture histories on this first run. The
    // count is asserted because the progress decision turns on it: one write
    // per phase, never one per driver
    // (decisions/2026-09-18-coarse-agent-progress.md).
    expect(mem.writes).toBe(6 + 23)
  })

  it('is deterministic: the same fixtures twice write identical entities', async () => {
    const a = await refresh(deps())
    const b = await refresh(deps())
    expect(a.snapshot.entities).toEqual(b.snapshot.entities)
  })
})

describe('refresh live (fixtures standing in for the network)', () => {
  it('marks figures current and agent-updated when every source answers', async () => {
    const mem = memoryKv()
    const live = deps({ kv: mem.kv, fixturesOnly: false, fetchText: fixtureFetch() })
    const first = await refresh(live)
    expect(first.phase).toBe('done')
    expect(first.snapshot.agent.interruption).toBeNull()
    expect(first.requests).toBeLessThanOrEqual(45)
    const statuses = new Set(Object.values(first.snapshot.entities).flatMap(e => Object.values(e.metrics).map(f => f.status)))
    expect(statuses).toEqual(new Set(['current']))
    // 23 latest requests plus 22 backfill chunks fit the budget of 45, so
    // one driver waits; the second run reaches it.
    const written = () => Object.keys(config.drivers).filter(id => mem.store.has(KEYS.history(id))).length
    expect(written()).toBe(22)
    await refresh(live)
    expect(written()).toBe(23)
  })

  it('one failing adapter: its figures stale, phase waiting, an interruption record, no throw', async () => {
    const mem = memoryKv()
    const fetchText = fixtureFetch(url => url.includes('tidesandcurrents'))
    const result = await refresh(deps({ kv: mem.kv, fixturesOnly: false, fetchText }))
    expect(result.phase).toBe('waiting')
    const i = result.snapshot.agent.interruption!
    expect(i.level).toBe('source')
    expect(i.providers).toEqual(['NOAA CO-OPS'])
    expect(i.failures[0]!.error).toContain('503')
    // Tide-exposed companies stale, the rest current.
    const tideExposed = config.companies.filter(c => c.exposures.some(e => e.driver === 'tide')).map(c => c.id)
    for (const [id, e] of Object.entries(result.snapshot.entities)) {
      const expected = tideExposed.includes(id) ? 'stale' : 'current'
      for (const f of Object.values(e.metrics)) expect(f.status, id).toBe(expected)
    }
  })

  it('every adapter failing: the board still renders from fixtures, all stale, level all', async () => {
    const mem = memoryKv()
    const fetchText = async () => {
      throw new Error('ECONNRESET')
    }
    const result = await refresh(deps({ kv: mem.kv, fixturesOnly: false, fetchText }))
    expect(result.phase).toBe('waiting')
    expect(result.snapshot.agent.interruption!.level).toBe('all')
    expect(Object.keys(result.snapshot.entities)).toHaveLength(20)
    const statuses = new Set(Object.values(result.snapshot.entities).flatMap(e => Object.values(e.metrics).map(f => f.status)))
    expect(statuses).toEqual(new Set(['stale']))
  })

  it('stays inside the request budget and writes history only when it changes', async () => {
    const mem = memoryKv()
    const live = () => deps({ kv: mem.kv, fixturesOnly: false, fetchText: fixtureFetch() })
    const first = await refresh(live())
    const writesAfterFirst = mem.writes
    // 23 latest + one chunk per driver on the first run, capped at 45.
    expect(first.requests).toBe(45)
    const second = await refresh(live())
    // Second run: 23 latest, trailing not yet due, backfill continues for
    // the drivers the first run's budget did not reach.
    expect(second.requests).toBeLessThanOrEqual(45)
    expect(second.requests).toBeGreaterThanOrEqual(23)
    // Three writes (agent reading, snapshot, agent done) per run plus any history.
    expect(mem.writes - writesAfterFirst).toBeGreaterThanOrEqual(3)
  })
})

describe('runRefresh', () => {
  it('a throwing handler writes phase error and nothing else', async () => {
    const mem = memoryKv()
    await refresh(deps({ kv: mem.kv }))
    const before = mem.store.get(KEYS.snapshot)
    const result = await runRefresh(
      deps({
        kv: mem.kv,
        loadFixture: async () => {
          throw new Error('disk gone')
        },
      }),
    )
    expect(result.phase).toBe('error')
    expect(mem.store.get(KEYS.snapshot)).toBe(before)
    const agent = JSON.parse(mem.store.get(KEYS.agent)!)
    expect(agent.phase).toBe('error')
    expect(agent.interruption.level).toBe('handler')
    expect(agent.error).toContain('disk gone')
  })

  // contracts/agent-presence.md, "Phase semantics": one write per phase, and
  // `building` is a phase that happens. Never one write per driver, which is
  // decisions/2026-09-18-coarse-agent-progress.md.
  it('writes the agent key once per phase, with coarse progress', async () => {
    const mem = memoryKv()
    await refresh(deps({ kv: mem.kv }))
    expect(phaseLog(mem)).toEqual([
      ['reading', 0],
      ['building', 1],
      ['done', 1],
    ])
  })

  it('a failed source ends the same sequence in waiting', async () => {
    const mem = memoryKv()
    await refresh(deps({ kv: mem.kv, fixturesOnly: false, fetchText: fixtureFetch(url => url.includes('frankfurter')) }))
    expect(phaseLog(mem).map(([phase]) => phase)).toEqual(['reading', 'building', 'waiting'])
  })
})
