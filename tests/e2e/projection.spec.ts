import { test, expect } from '@playwright/test'
import { axe } from './land'

// M12 step 4 on the Worker runtime, fixtures mode: the projection fan
// (decisions/2026-10-19-the-projection-runs-the-config-forward.md).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const toggle = (page: import('@playwright/test').Page) => page.getByRole('checkbox', { name: /Projection/ })

// The first fan's reveal width, frame by frame, from a toggle.
async function revealFrames(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const box = [...document.querySelectorAll('label')].find(l => l.textContent?.includes('Projection'))!.querySelector('input') as HTMLInputElement
    box.click()
    const out: number[] = []
    for (let i = 0; i < 90; i++) {
      await new Promise(r => requestAnimationFrame(r))
      const r = document.querySelector('[data-fan-reveal]')
      if (r) out.push(Math.round(parseFloat(r.getAttribute('width') ?? '0')))
    }
    return out
  })
}

test.describe('the projection fan', () => {
  test('a checkbox shows it past today for every charted row, in the URL and across a reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await expect(toggle(page)).not.toBeChecked()
    await expect(page.locator('[data-fan]')).toHaveCount(0)
    await toggle(page).check()
    await expect(page).toHaveURL('/?proj=1')
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    await expect(page.locator('[data-fan-mark]')).toContainText('projection')
    await expect(page.locator('[data-fan-note]')).toContainText('drivers held')
    await expect(page.getByRole('region', { name: 'Chart' }).getByRole('img').first()).toHaveAttribute('aria-label', /30-day projection/)
    await page.reload()
    await expect(toggle(page)).toBeChecked()
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    await toggle(page).uncheck()
    await expect(page.locator('[data-fan]')).toHaveCount(0)
    await expect(page).toHaveURL('/')
  })

  test('the fan opens from today, left to right, after the rescale', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const widths = await revealFrames(page)
    expect(widths.length).toBeGreaterThan(10)
    expect(widths[0]).toBe(0)
    // It waits for the rescale before it opens, then opens over many frames.
    expect(widths.slice(0, 5).every(w => w === 0)).toBe(true)
    const final = widths[widths.length - 1]!
    expect(final).toBeGreaterThan(100)
    expect(widths.filter(w => w > 0 && w < final).length).toBeGreaterThan(5)
  })

  test('on landing with the fan on, it waits for the last line to land', async ({ page }) => {
    // The draw runs Cinematic and the last line lands at slower + slow,
    // 2300 ms (decisions/2026-10-21-the-draw-runs-cinematic.md); the fan
    // opens only after it.
    await page.addInitScript(() => {
      const w = window as unknown as { __fan: { first: number | null; open: number | null } }
      w.__fan = { first: null, open: null }
      const tick = () => {
        const now = performance.now()
        if (w.__fan.first === null && document.querySelector('[data-reveal]')) w.__fan.first = now
        const r = document.querySelector('[data-fan-reveal]')
        if (w.__fan.open === null && r && parseFloat(r.getAttribute('width') ?? '0') > 0.5) w.__fan.open = now
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto('/?proj=1')
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    await page.waitForTimeout(3200)
    const { first, open } = await page.evaluate(() => (window as unknown as { __fan: { first: number; open: number } }).__fan)
    expect(open - first).toBeGreaterThan(2000)
  })

  test('is Level\'s only: another metric hides the checkbox and the fan', async ({ page }) => {
    await page.goto('/?proj=1')
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    await page.getByRole('group', { name: 'Metric' }).getByRole('button', { name: 'Δ 1d' }).click()
    await expect(page.locator('[data-fan]')).toHaveCount(0)
    await expect(toggle(page)).toHaveCount(0)
  })

  test('passes axe with the fan showing', async ({ page }) => {
    await page.goto('/?proj=1')
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    const results = await (await axe(page)).analyze()
    expect(results.violations).toEqual([])
  })

  test('under reduced motion the fan is simply there', async ({ page }) => {
    await page.goto('/?reduce=1')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const widths = await revealFrames(page)
    const final = widths[widths.length - 1]!
    expect(widths.slice(4).every(w => w === final)).toBe(true)
  })
})
