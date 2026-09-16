// The Worker-side dependencies for the refresh handler: real KV, real
// fetch, fixtures through the assets binding, the real clock. Both triggers
// (the cron entry and the route) build their deps here, so the two can
// never drift.

import { config } from '@/lib/config'
import type { RefreshDeps } from './refresh'

export type BasisEnv = {
  BASIS_KV: { get(key: string, type: 'text'): Promise<string | null>; put(key: string, value: string): Promise<void> }
  ASSETS: { fetch(request: Request | string | URL): Promise<Response> }
  BASIS_FIXTURES?: string
}

export function depsFromEnv(env: BasisEnv): RefreshDeps {
  return {
    kv: {
      get: key => env.BASIS_KV.get(key, 'text'),
      put: (key, value) => env.BASIS_KV.put(key, value),
    },
    fetchText: async url => {
      const res = await fetch(url, { headers: { accept: 'application/json, text/csv' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    },
    // The assets binding serves public/ from inside the Worker: no request
    // leaves Cloudflare to read a fixture. The host in the URL is ignored;
    // only the path matters.
    loadFixture: async name => {
      const res = await env.ASSETS.fetch(new URL(`/fixtures/${name}`, 'https://basis.invalid'))
      if (!res.ok) throw new Error(`fixture ${name}: HTTP ${res.status}`)
      return res.text()
    },
    now: () => new Date(),
    fixturesOnly: env.BASIS_FIXTURES === '1',
    config,
  }
}
