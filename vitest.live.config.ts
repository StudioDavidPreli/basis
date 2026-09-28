import { defineConfig } from 'vitest/config'
import path from 'node:path'

// The one suite that reaches the network: fixture-vs-live parity
// (plan.md, M9). Never part of the gate, which runs on fixtures only
// (CLAUDE.md); run by hand with `npm run test:live`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['sources/**/*.live.ts'],
    testTimeout: 30_000,
  },
})
