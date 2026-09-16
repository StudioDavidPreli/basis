import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// Under `next dev`, getCloudflareContext() resolves the bindings in
// wrangler.jsonc through a local simulation; without this the refresh route
// has no KV in development. No effect on the build.
initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {
  // React Compiler on (CLAUDE.md, Stack). It memoizes components and hooks
  // automatically, which matters in M9 when thirty rows of Figures must not
  // re-render on MotionValue ticks. Turned on from the first commit so no
  // code is ever written that depends on it being off.
  reactCompiler: true,
}

export default nextConfig
