import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cooldownRemainingMs, runRefresh, KEYS, type StoredSnapshot } from '@/worker/refresh'
import { depsFromEnv, type BasisEnv } from '@/worker/deps'
import { fixtureFetchFor } from '@/worker/fixtureFetch'
import { adapters } from '@/sources'

// On-demand refresh: the same handler the cron runs (docs/spec.md). POST
// runs it and answers with a summary; GET reads the stored snapshot. No
// auth (spec non-goals), and nothing about the run depends on the request,
// with one exception that exists only under the fixtures environment:
//
//   POST /api/refresh?fail=noaa-coops   one adapter fails (banner level: source)
//   POST /api/refresh?fail=all          every adapter fails (level: all)
//   POST /api/refresh?fail=handler      the handler throws (level: handler)
//
// These run the real live code path against fixtures standing in for the
// network, so the e2e suite reaches every interruption level from fixtures.
// Outside the fixtures environment the parameter is ignored.
//
// Also outside it, a POST within REFRESH_COOLDOWN_MS of the last run's start
// answers 429 without running. The fixtures environment skips the cooldown:
// the suites refresh before every test, and none of it reaches a source.

export const dynamic = 'force-dynamic'

async function env(): Promise<BasisEnv> {
  const { env } = await getCloudflareContext({ async: true })
  return env as unknown as BasisEnv
}

export async function POST(request: Request) {
  const e = await env()
  const deps = depsFromEnv(e)
  if (e.BASIS_FIXTURES !== '1') {
    const remaining = cooldownRemainingMs(await e.BASIS_KV.get(KEYS.agent, 'text'), deps.now())
    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000)
      return Response.json({ phase: 'cooling', retryAfterSeconds: seconds }, { status: 429, headers: { 'Retry-After': String(seconds) } })
    }
  }
  const fail = new URL(request.url).searchParams.get('fail')
  if (fail && e.BASIS_FIXTURES === '1') {
    if (fail === 'handler') {
      deps.loadFixture = async () => {
        throw new Error('fixture store unavailable (simulated)')
      }
    } else {
      deps.fixturesOnly = false
      deps.fetchText = fixtureFetchFor(adapters, deps.loadFixture, id => fail === 'all' || id === fail)
    }
  }
  const result = await runRefresh(deps)
  if ('error' in result) return Response.json({ phase: 'error', error: result.error }, { status: 500 })
  return Response.json({
    phase: result.phase,
    at: result.snapshot.at,
    entities: Object.keys(result.snapshot.entities).length,
    mutations: result.mutations.length,
    requests: result.requests,
    interruption: result.snapshot.agent.interruption,
  })
}

export async function GET() {
  const e = await env()
  const [text, agentText] = await Promise.all([e.BASIS_KV.get(KEYS.snapshot, 'text'), e.BASIS_KV.get(KEYS.agent, 'text')])
  if (!text) return Response.json({ snapshot: null }, { status: 404 })
  const snapshot = JSON.parse(text) as StoredSnapshot
  // The agent key can be newer than the snapshot's own copy (a run in
  // flight, or a handler error that wrote nothing else); readers want the
  // newer one.
  if (agentText) snapshot.agent = JSON.parse(agentText)
  return Response.json(snapshot)
}
