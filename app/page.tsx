import { getCloudflareContext } from '@opennextjs/cloudflare'
import { KEYS, runRefresh, type StoredSnapshot } from '@/worker/refresh'
import { depsFromEnv, type BasisEnv } from '@/worker/deps'
import { Surface } from '@/components/surface'

// The server component (docs/spec.md, "Server / client boundary"): reads
// the KV snapshot and passes plain data to <Surface>, the client boundary.
// Nothing below Surface does IO except POST /api/refresh.
//
// Cold KV (first deploy, or the fixtures environment before any POST): the
// spec's answer is to render from fixtures with every figure stale and say
// so. One refresh run in-process does exactly that, and writes the snapshot
// so the next request reads it.

export const dynamic = 'force-dynamic'

export default async function Page() {
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
  return <Surface snapshot={snapshot} cold={cold} renderedAt={new Date().toISOString()} />
}
