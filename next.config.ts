import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// Under `next dev`, getCloudflareContext() resolves the bindings in
// wrangler.jsonc through a local simulation; without this the refresh route
// has no KV in development. No effect on the build. With BASIS_FIXTURES=1
// in the shell it takes the `fixtures` wrangler environment, so the
// dev-mode Playwright project (playwright.dev.config.ts) never reaches a
// live source, the same rule the built-output suite runs under.
initOpenNextCloudflareForDev({ environment: process.env.BASIS_FIXTURES === '1' ? 'fixtures' : undefined })

const nextConfig: NextConfig = {
  // React Compiler on (CLAUDE.md, Stack). It memoizes components and hooks
  // automatically, which matters in M9 when thirty rows of Figures must not
  // re-render on MotionValue ticks. Turned on from the first commit so no
  // code is ever written that depends on it being off.
  reactCompiler: true,
  // Next 16 appends an agent-rules block to CLAUDE.md on every `next dev`
  // start. The dev server now runs inside the push gate, which must leave
  // the tree clean (decisions/2026-09-17-a-dev-mode-gate.md).
  agentRules: false,
}

export default nextConfig
