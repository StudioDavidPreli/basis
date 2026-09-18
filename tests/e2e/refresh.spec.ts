import { test, expect } from '@playwright/test'

// M3 on the Worker runtime, fixtures mode (the `fixtures` wrangler
// environment sets BASIS_FIXTURES=1). POST runs the handler; GET reads what
// it wrote. Both go through the real KV simulation in wrangler dev.

test.describe('the refresh handler', () => {
  test('POST writes a snapshot of every entity from fixtures with no external request', async ({ request }) => {
    const res = await request.post('/api/refresh')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.phase).toBe('done')
    expect(body.entities).toBe(20)
    expect(body.requests).toBe(0)
    expect(body.interruption).toBeNull()
  })

  test('GET returns the stored snapshot with stale, sourced figures', async ({ request }) => {
    await request.post('/api/refresh')
    const res = await request.get('/api/refresh')
    expect(res.status()).toBe(200)
    const snapshot = await res.json()
    expect(Object.keys(snapshot.entities)).toHaveLength(20)
    const figure = snapshot.entities['ou-tokyo'].metrics.level
    expect(figure.status).toBe('stale')
    expect(figure.source.map((s: { provider: string }) => s.provider)).toEqual(['Open-Meteo', 'Frankfurter'])
    expect(snapshot.agent.phase).toBe('done')
  })

  // The client's own refresh is the one moment a reader can observe a run
  // (decisions/2026-09-18-coarse-agent-progress.md), and present() keys off
  // phase, so it is also the moment `refreshing` figures become reachable
  // outside /embed/figure. Before the optimistic phase the snapshot said
  // `done` for the whole POST and pressing Refresh changed no figure at all.
  test('a manual refresh reads as reading, shimmers every figure, and settles', async ({ page }) => {
    await page.goto('/')
    const mark = page.getByRole('img', { name: /^Agent / })
    await expect(mark).toHaveAttribute('data-phase', /done|idle|waiting/)
    await expect(page.locator('[data-status="refreshing"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(mark).toHaveAttribute('aria-label', 'Agent reading sources')
    await expect(mark).toHaveAttribute('data-progress', '0')
    expect(await page.locator('[data-status="refreshing"]').count()).toBeGreaterThan(0)

    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
    await expect(mark).toHaveAttribute('aria-label', 'Agent done')
    await expect(page.locator('[data-status="refreshing"]')).toHaveCount(0)
  })
})
