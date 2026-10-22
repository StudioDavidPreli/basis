import { test, expect } from '@playwright/test'

// The margin counts the data's age (decisions/2026-10-21-the-margin-counts-
// the-datas-age.md): absent from the server's HTML, so hydration agrees,
// then the time since the snapshot, to the second.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

test.describe('the margin', () => {
  test('carries no age in the server\'s HTML, then counts it to the second', async ({ page, request }) => {
    const html = await (await request.get('/')).text()
    const served = html.match(/data-age="">([^<]*)</)
    expect(served?.[1] ?? '').toBe('')
    await page.goto('/')
    const age = page.locator('[data-age]')
    await expect(age).toHaveText(/^\+(\d+ d )?(\d+:)?\d{2}:\d{2}$/)
    const first = await age.textContent()
    await expect(age).not.toHaveText(first!, { timeout: 2500 })
  })

  test('Basis holds still on load: it scrambles on the minute, not on arrival', async ({ page }) => {
    // The count is only known on the client, so its first minute reached
    // the scramble a render after the mount and read as a change: Basis
    // scrambled on every load (2026-10-21).
    await page.addInitScript(() => {
      const w = window as unknown as { __shown: Set<string> }
      w.__shown = new Set()
      const t0 = performance.now()
      const tick = () => {
        const label = document.querySelector('aside span')
        if (label) w.__shown.add(label.querySelector('[aria-hidden="true"]')?.textContent ?? 'Basis')
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto('/')
    await page.waitForTimeout(2800)
    expect(await page.evaluate(() => [...(window as unknown as { __shown: Set<string> }).__shown])).toEqual(['Basis'])
  })
})
