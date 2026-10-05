import { defineConfig, devices } from '@playwright/test'

// Every e2e run is against BUILT output served by the real Worker runtime:
// `npm run preview` runs the Next build, the OpenNext build, and wrangler dev
// on 8787, in the `fixtures` wrangler environment so no test ever touches a
// live source (CLAUDE.md: tests run on fixtures). The rule is inherited from Cadence, where a whole class of bugs
// (CSS minification, code splitting) was invisible under the dev server.
// reuseExistingServer stays off for the reason it went off there: a stale
// server on the port would pass the suite against output it never compiled.
export default defineConfig({
  testDir: './tests/e2e',
  // One worker, in order. The server holds one KV, and the suite writes to
  // it (every refresh, every ?fail= run): parallel tests overwrote each
  // other's snapshots between a POST and the page load that read it.
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // David reviews in Safari. WebKit runs the motion specs whose failure
    // would be engine-specific: the ledger's reorder, its slips over still
    // bands, and the theme crossfade (2026-10-05).
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /row reorder|bands|one crossfade/ },
  ],
  webServer: {
    command: 'npm run preview:fixtures',
    url: 'http://localhost:8787',
    reuseExistingServer: false,
    timeout: 300_000,
    env: { BASIS_FIXTURES: '1' },
  },
})
