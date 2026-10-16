import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests are co-located (`*.test.ts`, `*.test.tsx`) and run in Node by
// default; a file that needs a DOM says so with a `@vitest-environment jsdom`
// comment at its top, as lib/motion/tokens.test.tsx does. Playwright specs
// live under tests/e2e and are excluded here so `npm test` never starts a
// browser.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['**/*.test.{ts,tsx}'],
    // .claude/ holds other sessions' worktrees of this repo, node_modules and all.
    exclude: ['node_modules/**', '.next/**', '.open-next/**', '.claude/**', 'tests/e2e/**'],
    env: { BASIS_FIXTURES: '1' },
  },
})
