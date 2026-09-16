// The Worker entry (wrangler.jsonc `main`). OpenNext generates
// .open-next/worker.js with the Next handler as `fetch`; this file wraps it
// to add `scheduled`, so the Cron Trigger runs the same refresh the route
// runs. The three durable-object classes are re-exported because the
// generated module exports them and wrangler resolves bindings by name from
// the entry module, whether or not this deployment configures them.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the module is absent before the OpenNext build
// @ts-ignore built output: present after `opennextjs-cloudflare build`, absent
// when `next build` typechecks first on a fresh checkout (Cloudflare's builder)
import handler, { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js'
import { runRefresh } from './refresh'
import { depsFromEnv, type BasisEnv } from './deps'

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge }

type Ctx = { waitUntil(promise: Promise<unknown>): void }

const worker = {
  fetch: handler.fetch as (request: Request, env: BasisEnv, ctx: Ctx) => Promise<Response>,
  async scheduled(_event: unknown, env: BasisEnv, ctx: Ctx) {
    ctx.waitUntil(runRefresh(depsFromEnv(env)))
  },
}

export default worker
