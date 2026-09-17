import { getCloudflareContext } from '@opennextjs/cloudflare'
import { KEYS, runRefresh, type StoredSnapshot } from './refresh'
import type { SeriesSnapshot } from '@/lib/types'
import { depsFromEnv, type BasisEnv } from './deps'

// The read every page starts with (docs/spec.md, "Server / client
// boundary"): the KV snapshot, with the agent key on top when it is newer.
//
// Cold KV (first deploy, or the fixtures environment before any POST): the
// spec's answer is to render from fixtures with every figure stale and say
// so. One refresh run in-process does exactly that, and writes the snapshot
// so the next request reads it. The sheet, the drawer, and the full entity
// page all read through here, so none of them can see a different answer.

export type Loaded = { snapshot: StoredSnapshot | null; cold: boolean }

export async function loadSnapshot(): Promise<Loaded> {
  const { env } = await getCloudflareContext({ async: true })
  const e = env as unknown as BasisEnv
  let text = await e.BASIS_KV.get(KEYS.snapshot, 'text')
  let cold = false
  if (!text) {
    cold = true
    await runRefresh(depsFromEnv(e))
    text = await e.BASIS_KV.get(KEYS.snapshot, 'text')
  }
  const agentText = await e.BASIS_KV.get(KEYS.agent, 'text')
  const snapshot = text ? (JSON.parse(text) as StoredSnapshot) : null
  if (snapshot && agentText) snapshot.agent = JSON.parse(agentText)
  return { snapshot, cold }
}

// The chart's series for one dataset (decisions/2026-09-16-series-in-their-
// own-key.md), written by the same run as the snapshot. Read after
// loadSnapshot, so a cold store has been filled by the time this looks.
export async function loadSeries(dataset: string): Promise<SeriesSnapshot | null> {
  const { env } = await getCloudflareContext({ async: true })
  const e = env as unknown as BasisEnv
  const text = await e.BASIS_KV.get(KEYS.series(dataset), 'text')
  return text ? (JSON.parse(text) as SeriesSnapshot) : null
}
