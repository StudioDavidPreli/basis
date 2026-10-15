import { defineConfig, devices } from '@playwright/test'

// The second suite, against `next dev` (decisions/2026-09-17-a-dev-mode-
// gate.md). The main suite runs on built output, where React runs every
// effect once; development Strict Mode runs each effect twice on the same
// element, and a whole class of bugs (an effect that depends on the
// element being untouched by a previous run of itself) only shows there.
// These specs watch the motion itself, frame by frame, on the dev server,
// in fixtures mode. Run after the main suite, never beside it: both start
// a local Cloudflare simulation over the same state directory.
export default defineConfig({
  testDir: './tests/dev',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  // The first hit of each route compiles it; the budget is for that.
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    // The welcome is dismissed for every spec but its own, which starts
    // from empty storage (tests/e2e/welcome.spec.ts).
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'basis-welcome', value: 'dismissed' }] }] },
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium-dev', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BASIS_FIXTURES: '1' },
  },
})
