import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // React Compiler on (CLAUDE.md, Stack). It memoizes components and hooks
  // automatically, which matters in M9 when thirty rows of Figures must not
  // re-render on MotionValue ticks. Turned on from the first commit so no
  // code is ever written that depends on it being off.
  reactCompiler: true,
}

export default nextConfig
