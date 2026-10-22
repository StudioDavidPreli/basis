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

  // Loops do not run under reduced motion (contracts/cadence-basis.md): a
  // loop flattened to 10ms cycles a hundred times a second and flickered
  // on the refresh arrow (David, 2026-09-28). The refresh is held open so
  // both loops can be read mid-run.
  for (const reduce of [false, true]) {
    test(`while a refresh runs, the arrow and the shimmer ${reduce ? 'hold still under reduced motion' : 'loop'}`, async ({ page }) => {
      let release: () => void = () => {}
      const held = new Promise<void>(r => (release = r))
      await page.route('**/api/refresh', async route => {
        if (route.request().method() !== 'POST') return route.continue()
        await held
        await route.continue()
      })
      await page.goto(reduce ? '/?reduce=1' : '/')
      const button = page.getByRole('button', { name: 'Refresh', exact: true })
      await button.click()
      const busy = page.getByRole('button', { name: 'Refreshing', exact: true })
      await expect(busy).toHaveAttribute('aria-busy', 'true')
      const arrow = await busy.locator('svg').evaluate(e => getComputedStyle(e).animationName)
      const shimmer = await page.locator('[data-status="refreshing"] span[class*="value"]').first().evaluate(e => getComputedStyle(e).animationName)
      if (reduce) {
        expect(arrow).toBe('none')
        expect(shimmer).toBe('none')
      } else {
        expect(arrow).not.toBe('none')
        expect(shimmer).not.toBe('none')
      }
      release()
      await expect(button).toBeEnabled()
    })
  }
})

// The fresh flash takes direction (decisions/2026-10-22-the-fresh-flash-
// takes-direction.md): a rise flashes the accent, a fall --down, as the
// heat view colours a move. Each flash is pinned at its first frame and its
// ink compared with the stock's own colour, read off a probe.
test.describe('the fresh flash', () => {
  for (const theme of ['passbook', 'operate']) {
    for (const [dir, token] of [['up', '--accent'], ['down', '--down']] as const) {
      test(`on ${theme}, a ${dir === 'up' ? 'rise' : 'fall'} flashes ${token}`, async ({ page }) => {
        await page.goto(`/embed/figure?status=agent-updated${dir === 'down' ? '&direction=down' : ''}&theme=${theme}`)
        const fig = page.locator('span[data-status="agent-updated"]')
        await expect(fig).toHaveAttribute('data-direction', dir)
        const r = await fig.evaluate((el, token) => {
          const probe = document.createElement('span')
          probe.style.color = `var(${token})`
          el.append(probe)
          const want = getComputedStyle(probe).color
          probe.remove()
          const value = el.querySelector('button span')!
          const a = value.getAnimations().find(x => (x as CSSAnimation).animationName?.includes('fresh'))!
          a.pause()
          a.currentTime = 0
          return { want, got: getComputedStyle(value).color }
        }, token)
        expect(r.got).toBe(r.want)
      })
    }
  }
})
