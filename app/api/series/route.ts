import { getCloudflareContext } from '@opennextjs/cloudflare'
import { KEYS } from '@/worker/refresh'
import type { BasisEnv } from '@/worker/deps'
import { config } from '@/lib/config'

// The chart's series for one dataset, as the refresh stored them
// (decisions/2026-09-16-series-in-their-own-key.md). The page ships the
// active dataset's series with the first render; the sheet reads the other
// here when the dataset tab switches, and the active one again when the
// poll sees a newer snapshot. Read-only; the cron and POST /api/refresh
// write it.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const dataset = new URL(request.url).searchParams.get('dataset') ?? ''
  if (!config.datasets[dataset]) return Response.json({ error: `unknown dataset ${dataset}` }, { status: 400 })
  const { env } = await getCloudflareContext({ async: true })
  const text = await (env as unknown as BasisEnv).BASIS_KV.get(KEYS.series(dataset), 'text')
  if (!text) return Response.json({ series: null }, { status: 404 })
  return new Response(text, { headers: { 'content-type': 'application/json' } })
}
