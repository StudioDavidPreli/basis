import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import kvIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache'

// decisions/2026-09-16-cloudflare-not-vercel.md: Workers through OpenNext,
// incremental cache on KV. The KV binding it reads is NEXT_INC_CACHE_KV
// (wrangler.jsonc). Snapshots and the mutation log get their own binding,
// BASIS_KV, in M3.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
})
