import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M13's phone tier (decisions/2026-10-20-two-breakpoints-640-and-900.md,
// decisions/2026-10-20-the-ledger-is-a-sheet-on-a-phone.md): under 640px
// every view, metric, and range is on screen, without ⌘K.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

type Box = { top: number; bottom: number; left: number; right: number; mid: number; width: number }
const box = (l: import('@playwright/test').Locator): Promise<Box> =>
  l.evaluate(e => {
    const r = e.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: r.top + r.height / 2, width: r.width }
  })

test.describe('a phone, 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the controls are three rows: the views across, the metrics, then projection and the range', async ({ page }) => {
    await page.goto('/')
    const views = page.getByRole('group', { name: 'Chart view' })
    const metric = page.getByRole('group', { name: 'Metric' })
    const range = page.getByRole('group', { name: 'Time range' })
    const projection = page.getByRole('checkbox', { name: /Projection/ })
    for (const l of [views, metric, range, projection]) await expect(l).toBeVisible()

    // The view switch spans the content: three equal segments on one row.
    const segments = await Promise.all((await views.getByRole('button').all()).map(box))
    expect(segments).toHaveLength(3)
    for (const s of segments) {
      expect(Math.abs(s.mid - segments[0]!.mid)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.width - segments[0]!.width)).toBeLessThanOrEqual(1)
    }
    const v = await box(views)
    const r = await box(range)
    expect(Math.abs(v.right - r.right)).toBeLessThanOrEqual(1)

    // Then the metrics, then projection and range together.
    const m = await box(metric)
    const p = await box(projection)
    expect(m.top).toBeGreaterThanOrEqual(v.bottom)
    expect(p.mid).toBeGreaterThan(m.bottom)
    expect(Math.abs(r.mid - p.mid)).toBeLessThanOrEqual(2)
  })

  for (const view of ['time', 'risk', 'heat'] as const) {
    test(`?view=${view}: the switch shows the view pressed, nothing scrolls sideways, axe is clean`, async ({ page }) => {
      await page.goto(`/?view=${view}`)
      const label = { time: 'Over time', risk: 'Risk / return', heat: 'Heat' }[view]
      await expect(page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('a tap on a view switches it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: 'Heat' }).click()
    await expect(page).toHaveURL(/view=heat/)
    await expect(page.locator('[data-heat]')).toBeVisible()
  })
})
