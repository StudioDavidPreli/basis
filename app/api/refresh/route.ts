import { getCloudflareContext } from '@opennextjs/cloudflare'
import { runRefresh, KEYS, type StoredSnapshot } from '@/worker/refresh'
import { depsFromEnv, type BasisEnv } from '@/worker/deps'

// On-demand refresh: the same handler the cron runs (docs/spec.md). POST
// runs it and answers with a summary; GET reads the stored snapshot. No
// auth (spec non-goals), and nothing about the run depends on the request.

export const dynamic = 'force-dynamic'

async function env(): Promise<BasisEnv> {
  const { env } = await getCloudflareContext({ async: true })
  return env as unknown as BasisEnv
}

export async function POST() {
  const result = await runRefresh(depsFromEnv(await env()))
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
  const text = await e.BASIS_KV.get(KEYS.snapshot, 'text')
  if (!text) return Response.json({ snapshot: null }, { status: 404 })
  const snapshot = JSON.parse(text) as StoredSnapshot
  return Response.json(snapshot)
}
