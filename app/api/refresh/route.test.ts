import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KEYS, REFRESH_COOLDOWN_MS, cooldownRemainingMs } from '@/worker/refresh'

// The cooldown (decisions/2026-11-04-on-demand-refresh-cools-down.md). The
// handler is mocked: a test here must never reach a source, and the point is
// whether the route calls it at all.
const runRefresh = vi.fn(async () => ({ phase: 'error' as const, error: 'mocked' }))
const context = vi.hoisted(() => ({ env: {} as Record<string, unknown> }))

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: async () => ({ env: context.env }) }))
vi.mock('@/worker/refresh', async original => ({
  ...(await original<typeof import('@/worker/refresh')>()),
  runRefresh: () => runRefresh(),
}))

function envWithAgent(startedAt: string, fixtures?: '1') {
  const put = vi.fn(async () => undefined)
  context.env = {
    BASIS_FIXTURES: fixtures,
    BASIS_KV: {
      get: async (key: string) => (key === KEYS.agent ? JSON.stringify({ startedAt }) : null),
      put,
    },
  }
  return put
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const post = async () => (await import('./route')).POST(new Request('https://basis.invalid/api/refresh', { method: 'POST' }))

describe('POST /api/refresh', () => {
  beforeEach(() => runRefresh.mockClear())

  it('answers 429 with Retry-After inside the cooldown, and neither runs nor writes', async () => {
    const put = envWithAgent(ago(60_000))
    const res = await post()
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(Number(res.headers.get('Retry-After'))).toBeLessThanOrEqual(REFRESH_COOLDOWN_MS / 1000)
    expect(runRefresh).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })

  it('runs once the cooldown has passed', async () => {
    envWithAgent(ago(REFRESH_COOLDOWN_MS + 1000))
    await post()
    expect(runRefresh).toHaveBeenCalledOnce()
  })

  it('skips the cooldown in the fixtures environment', async () => {
    envWithAgent(ago(60_000), '1')
    await post()
    expect(runRefresh).toHaveBeenCalledOnce()
  })
})

describe('cooldownRemainingMs', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  const agent = (startedAt: unknown) => JSON.stringify({ startedAt })

  it('counts down from the last run’s start', () => {
    expect(cooldownRemainingMs(agent('2026-11-04T11:50:00Z'), now)).toBe(5 * 60 * 1000)
    expect(cooldownRemainingMs(agent('2026-11-04T11:45:00Z'), now)).toBe(0)
  })

  it('does not hold the refresh shut on a missing, unreadable, or future start', () => {
    expect(cooldownRemainingMs(null, now)).toBe(0)
    expect(cooldownRemainingMs('not json', now)).toBe(0)
    expect(cooldownRemainingMs(agent(undefined), now)).toBe(0)
    expect(cooldownRemainingMs(agent('2026-11-04T13:00:00Z'), now)).toBe(0)
  })
})
