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
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview:fixtures',
    url: 'http://localhost:8787',
    reuseExistingServer: false,
    timeout: 300_000,
    env: { BASIS_FIXTURES: '1' },
  },
})
