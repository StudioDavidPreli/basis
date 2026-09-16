// The refresh cycle (docs/spec.md, "Simulation"; docs/sources.md, "Per-source
// adapter requirements"). Fetch every driver, recompute every entity, diff
// against the previous snapshot, write the new snapshot with its mutations
// and the agent phase. Triggered by the Cron Trigger and by POST
// /api/refresh, both through `runRefresh`.
//
// Pure over its dependencies: the KV store, the fetch, the fixture loader,
// and the clock are all injected, so the tests run it in Node on an
// in-memory map with the recorded fixtures and a fixed date. Nothing here
// imports a Cloudflare type.
//
// Budget. The design assumes the free Workers plan and stays under its
// published limits with margin: at most 45 subrequests a run (limit 50),
// three KV writes a run (agent reading, the snapshot, agent done) plus the
// history writes that only happen on the daily trailing fetch or a backfill
// chunk (limit 1,000 writes a day, 96 runs a day, so about 300 plus history),
// and small responses so a run's CPU stays in the low milliseconds
// (limit 10 ms). If the account is on the paid plan none of this binds,
// and it costs nothing to keep. decisions/2026-09-16-chunked-backfill.md.

import { dominantDriver, type CompanyConfig, type Config, type DriverConfig, type RegionConfig } from '@/lib/config'
import { deriveLevel, normalize, type DriverSeries } from '@/lib/exposures'
import { generate } from '@/lib/processes'
import { deriveMetric } from '@/lib/metrics'
import { diff } from '@/lib/diff'
import { deriveStatus } from '@/lib/status'
import type { EntitySnapshot, FigureValue, Mutation, Snapshot, Source } from '@/lib/types'
import { adapterFor, type Adapter } from '@/sources'

// ── Dependencies and stored shapes ──────────────────────────────────────

export type KV = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

export type RefreshDeps = {
  kv: KV
  fetchText: (url: string) => Promise<string>
  loadFixture: (name: string) => Promise<string>
  now: () => Date
  fixturesOnly: boolean
  config: Config
  maxRequests?: number
}

export type AgentPhase = 'idle' | 'reading' | 'building' | 'waiting' | 'done' | 'error'

export type Interruption = {
  level: 'source' | 'all' | 'handler'
  providers: string[]
  failures: Array<{ provider: string; driver: string; url: string; error: string }>
  lastGoodAt: string | null
  at: string
}

export type AgentState = {
  phase: AgentPhase
  progress: number
  startedAt: string
  finishedAt: string | null
  lastSuccessAt: string | null
  interruption: Interruption | null
  error?: string
}

export type DriverHistory = {
  points: Array<[date: string, value: number]> // sorted ascending, unique dates
  coveredFrom: string | null // earliest date the backfill has reached
  trailingFetchedAt: string | null
  url: string | null
  fixture: boolean
}

// The snapshot KV value: the spec's Snapshot plus the run's mutation log and
// the agent state, in one write.
export type StoredSnapshot = Snapshot & {
  mutations: Mutation[]
  agent: AgentState
}

export const KEYS = {
  snapshot: 'snapshot',
  agent: 'agent',
  history: (driver: string) => `history:${driver}`,
}

const MUTATION_LOG_CAP = 300
const DEFAULT_MAX_REQUESTS = 45
const TRAILING_EVERY_MS = 24 * 3_600_000
const DAY_MS = 86_400_000

// ── Small date helpers (UTC, ISO dates) ─────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function shiftDays(date: string, days: number): string {
  return isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS))
}

// ── Fetching one driver ─────────────────────────────────────────────────

type LatestFetch = { value: number; asOf: string; url: string; fixture: boolean; error?: string }

async function fetchLatest(
  deps: RefreshDeps,
  adapter: Adapter,
  driver: DriverConfig,
  budget: { used: number },
): Promise<LatestFetch> {
  const url = adapter.latestUrl(driver.params)
  if (!deps.fixturesOnly) {
    try {
      budget.used += 1
      const text = await deps.fetchText(url)
      return { ...adapter.parseLatest(text, driver.params), url, fixture: false }
    } catch (e) {
      // The spec's first interruption level: this driver's fixture is served
      // and every figure that depends on it goes stale.
      const text = await deps.loadFixture(adapter.fixtures.latest)
      return { ...adapter.parseLatest(text, driver.params), url, fixture: true, error: String(e) }
    }
  }
  const text = await deps.loadFixture(adapter.fixtures.latest)
  return { ...adapter.parseLatest(text, driver.params), url, fixture: true }
}

function mergePoints(
  existing: Array<[string, number]>,
  incoming: Array<[string, number]>,
): Array<[string, number]> {
  const byDate = new Map(existing)
  for (const [d, v] of incoming) byDate.set(d, v)
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
}

// History grows backwards one chunk per run and forwards by the trailing
// window once a day, both inside the request budget. On the first run the
// most recent chunk comes first so the chart has something immediately.
async function updateHistory(
  deps: RefreshDeps,
  adapter: Adapter,
  driverId: string,
  driver: DriverConfig,
  budget: { used: number; max: number },
  stored: string | null,
): Promise<{ history: DriverHistory; wrote: boolean; error?: string }> {
  const key = KEYS.history(driverId)
  let history: DriverHistory = stored
    ? (JSON.parse(stored) as DriverHistory)
    : { points: [], coveredFrom: null, trailingFetchedAt: null, url: null, fixture: false }
  const now = deps.now()
  const today = isoDate(now)

  if (deps.fixturesOnly) {
    // Deterministic: the fixture range, every run, and nothing else.
    const text = await deps.loadFixture(adapter.fixtures.range)
    const points = adapter.parseRange(text, driver.params)
    const next: DriverHistory = {
      points,
      coveredFrom: points[0]?.[0] ?? null,
      trailingFetchedAt: now.toISOString(),
      url: null,
      fixture: true,
    }
    const wrote = JSON.stringify(next) !== stored
    if (wrote) await deps.kv.put(key, JSON.stringify(next))
    return { history: next, wrote }
  }

  let wrote = false
  let error: string | undefined

  // Trailing window, once a day.
  const trailingDue =
    !history.trailingFetchedAt || Date.parse(history.trailingFetchedAt) + TRAILING_EVERY_MS < now.getTime()
  if (history.points.length > 0 && trailingDue && budget.used < budget.max) {
    const from = shiftDays(today, -adapter.trailingDays)
    const url = adapter.rangeUrl(driver.params, from, today)
    try {
      budget.used += 1
      const points = adapter.parseRange(await deps.fetchText(url), driver.params)
      history = { ...history, points: mergePoints(history.points, points), trailingFetchedAt: now.toISOString(), url }
      wrote = true
    } catch (e) {
      error = String(e)
    }
  }

  // One backfill chunk, if the depth is not yet covered. Both depth and
  // chunk count days inclusive of today, so a chunk as long as the depth
  // covers it in one request and never asks for one more day.
  const target = shiftDays(today, -(adapter.historyDepthDays - 1))
  const needsBackfill = history.coveredFrom === null || history.coveredFrom > target
  if (needsBackfill && budget.used < budget.max) {
    const to = history.coveredFrom ? shiftDays(history.coveredFrom, -1) : today
    const from = shiftDays(to, -(adapter.historyChunkDays - 1)) < target ? target : shiftDays(to, -(adapter.historyChunkDays - 1))
    const url = adapter.rangeUrl(driver.params, from, to)
    try {
      budget.used += 1
      const points = adapter.parseRange(await deps.fetchText(url), driver.params)
      history = {
        ...history,
        points: mergePoints(history.points, points),
        coveredFrom: from,
        trailingFetchedAt: history.trailingFetchedAt ?? now.toISOString(),
        url,
        fixture: false,
      }
      wrote = true
    } catch (e) {
      error = String(e)
      // Nothing at all yet: serve the fixture range so the entity has an
      // axis. A later run replaces it with live history.
      if (history.points.length === 0) {
        const points = adapter.parseRange(await deps.loadFixture(adapter.fixtures.range), driver.params)
        history = { points, coveredFrom: null, trailingFetchedAt: null, url: null, fixture: true }
        wrote = true
      }
    }
  }

  // Still nothing (the budget ran out before this driver): serve the
  // fixture range for this run without persisting it, so the entity has an
  // axis now and the next run backfills for real.
  if (history.points.length === 0) {
    const points = adapter.parseRange(await deps.loadFixture(adapter.fixtures.range), driver.params)
    history = { points, coveredFrom: null, trailingFetchedAt: null, url: null, fixture: true }
  }

  if (wrote) await deps.kv.put(key, JSON.stringify(history))
  return { history, wrote, error }
}

// ── Recomputing one entity ──────────────────────────────────────────────

type DriverState = { config: DriverConfig; adapter: Adapter; latest: LatestFetch; history: DriverHistory }

// Values aligned to the axis dates by forward fill. Before a driver's first
// known point it is held at that first value, so its factor is exactly 1
// there: a driver with shallow history contributes nothing to the shape of
// the early series rather than inventing a shape.
function alignTo(axis: string[], points: Array<[string, number]>): number[] {
  const out: number[] = []
  let i = 0
  let last = points[0]?.[1] ?? 0
  for (const date of axis) {
    while (i < points.length && points[i]![0] <= date) {
      last = points[i]![1]
      i += 1
    }
    out.push(last)
  }
  return out
}

function sourceOf(driver: DriverConfig, state: DriverState): Source {
  return {
    kind: 'api',
    provider: driver.provider,
    ref: driver.ref,
    url: state.latest.url,
    asOf: state.latest.asOf,
    cadence: driver.cadence,
    ttlMs: driver.ttlMs,
    ...(state.latest.fixture ? { fixture: true as const } : {}),
  }
}

function computeEntity(
  entity: CompanyConfig | RegionConfig,
  dataset: 'comps' | 'regions',
  drivers: Record<string, DriverState>,
  prev: EntitySnapshot | undefined,
  deps: RefreshDeps,
): EntitySnapshot {
  const now = deps.now()
  const today = isoDate(now)
  const dominantId = dominantDriver(entity.exposures)
  const dominant = drivers[dominantId]!
  const axis = dominant.history.points.map(p => p[0])
  if (axis.length === 0) throw new Error(`${entity.id}: dominant driver ${dominantId} has no history`)

  const base = generate(entity.process, axis, deps.config.base.level)
  const series: DriverSeries[] = entity.exposures.map(e => ({
    weight: e.weight,
    values: alignTo(axis, drivers[e.driver]!.history.points),
    span: drivers[e.driver]!.config.span,
  }))
  const level = deriveLevel(base, series)

  // Today's level from the latest readings, against the same start values.
  let factor = 0
  entity.exposures.forEach((e, i) => {
    factor += e.weight * normalize(drivers[e.driver]!.latest.value, series[i]!.values[0]!, series[i]!.span)
  })
  const latestLevel = base[base.length - 1]! * factor
  const prevLevel = axis[axis.length - 1] === today ? level[level.length - 2] : level[level.length - 1]

  const sources = entity.exposures.map(e => sourceOf(drivers[e.driver]!.config, drivers[e.driver]!))
  const columns = deps.config.datasets[dataset]!.columns
  const metrics: Record<string, FigureValue> = {}
  for (const column of columns) {
    const value = deriveMetric(column, {
      level: latestLevel,
      prevLevel,
      driverValue: dominant.latest.value,
      entity,
    })
    if (typeof value !== 'number') continue // text columns render from config
    const before = prev?.metrics[column.key]
    const changed = before !== undefined && Math.abs(before.value - value) > 1e-9
    metrics[column.key] = {
      value,
      ...(before ? { prev: before.value } : {}),
      source: sources,
      status: deriveStatus({ sources, changed, now }),
      updatedAt: now.toISOString(),
    }
  }
  return { metrics }
}

// ── The run ─────────────────────────────────────────────────────────────

export type RefreshResult = {
  snapshot: StoredSnapshot
  mutations: Mutation[]
  phase: AgentPhase
  requests: number
}

export async function refresh(deps: RefreshDeps): Promise<RefreshResult> {
  const { config } = deps
  const startedAt = deps.now().toISOString()
  const prevText = await deps.kv.get(KEYS.snapshot)
  const prev: StoredSnapshot | null = prevText ? (JSON.parse(prevText) as StoredSnapshot) : null
  const lastSuccessAt = prev?.agent.lastSuccessAt ?? null

  const reading: AgentState = {
    phase: 'reading',
    progress: 0,
    startedAt,
    finishedAt: null,
    lastSuccessAt,
    interruption: null,
  }
  await deps.kv.put(KEYS.agent, JSON.stringify(reading))

  const budget = { used: 0, max: deps.maxRequests ?? DEFAULT_MAX_REQUESTS }
  const failures: Interruption['failures'] = []
  const drivers: Record<string, DriverState> = {}
  const ids = Object.keys(config.drivers)

  // Latest readings first: they are what the figures show. Then history,
  // which is what the chart shows, inside whatever budget is left.
  for (const id of ids) {
    const driver = config.drivers[id]!
    const adapter = adapterFor(driver.adapter)
    const latest = await fetchLatest(deps, adapter, driver, budget)
    if (latest.error) failures.push({ provider: driver.provider, driver: id, url: latest.url, error: latest.error })
    drivers[id] = { config: driver, adapter, latest, history: { points: [], coveredFrom: null, trailingFetchedAt: null, url: null, fixture: false } }
  }
  // Drivers with no stored history go first, so a first chunk for a driver
  // the last run's budget did not reach outranks a deeper chunk for one it
  // did. KV reads are not budgeted; the fetches are.
  const stored = Object.fromEntries(await Promise.all(ids.map(async id => [id, await deps.kv.get(KEYS.history(id))] as const)))
  const ordered = [...ids].sort((a, b) => Number(stored[b] === null) - Number(stored[a] === null))
  for (const id of ordered) {
    const state = drivers[id]!
    const { history, error } = await updateHistory(deps, state.adapter, id, state.config, budget, stored[id] ?? null)
    state.history = history
    if (error) failures.push({ provider: state.config.provider, driver: id, url: history.url ?? '', error })
  }

  const at = deps.now().toISOString()
  const entities: Record<string, EntitySnapshot> = {}
  for (const c of config.companies) entities[c.id] = computeEntity(c, 'comps', drivers, prev?.entities[c.id], deps)
  for (const r of config.regions) entities[r.id] = computeEntity(r, 'regions', drivers, prev?.entities[r.id], deps)

  const next: Snapshot = { at, entities }
  const mutations = diff(prev, next)
  const log = [...mutations, ...(prev?.mutations ?? [])].slice(0, MUTATION_LOG_CAP)

  const failedProviders = [...new Set(failures.map(f => f.provider))]
  const allFailed = !deps.fixturesOnly && ids.every(id => drivers[id]!.latest.fixture)
  const interruption: Interruption | null =
    failures.length === 0
      ? null
      : { level: allFailed ? 'all' : 'source', providers: failedProviders, failures, lastGoodAt: lastSuccessAt, at }
  const phase: AgentPhase = failures.length > 0 ? 'waiting' : 'done'
  const agent: AgentState = {
    phase,
    progress: 1,
    startedAt,
    finishedAt: at,
    lastSuccessAt: phase === 'done' ? at : lastSuccessAt,
    interruption,
  }
  const snapshot: StoredSnapshot = { ...next, mutations: log, agent }
  await deps.kv.put(KEYS.snapshot, JSON.stringify(snapshot))
  await deps.kv.put(KEYS.agent, JSON.stringify(agent))
  return { snapshot, mutations, phase, requests: budget.used }
}

// The wrapper both triggers call. The spec's third interruption level: the
// handler threw, nothing was written, the previous snapshot stays live, and
// the phase says so. One write, to the agent key only.
export async function runRefresh(deps: RefreshDeps): Promise<RefreshResult | { phase: 'error'; error: string }> {
  try {
    return await refresh(deps)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    const at = deps.now().toISOString()
    const prevText = await deps.kv.get(KEYS.snapshot).catch(() => null)
    const prev = prevText ? (JSON.parse(prevText) as StoredSnapshot) : null
    const agent: AgentState = {
      phase: 'error',
      progress: 0,
      startedAt: at,
      finishedAt: at,
      lastSuccessAt: prev?.agent.lastSuccessAt ?? null,
      interruption: { level: 'handler', providers: [], failures: [], lastGoodAt: prev?.agent.lastSuccessAt ?? null, at },
      error,
    }
    await deps.kv.put(KEYS.agent, JSON.stringify(agent)).catch(() => undefined)
    return { phase: 'error', error }
  }
}
