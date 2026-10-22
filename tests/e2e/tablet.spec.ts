import { test, expect } from '@playwright/test'
import { axe } from './land'

// M13's tablet tier (decisions/2026-10-20-two-breakpoints-640-and-900.md):
// from 640 to 900px the chart keeps every control, wrapped to two rows, and
// the ledger picks its columns by its own width. An iPad in portrait is 820.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

// A row is where an element's middle is: the checkbox is shorter than a chip.
const mid = (l: import('@playwright/test').Locator) => l.evaluate(e => {
  const r = e.getBoundingClientRect()
  return Math.round(r.top + r.height / 2)
})

test.describe('a tablet, 820px', () => {
  test.use({ viewport: { width: 820, height: 1180 } })

  for (const theme of ['passbook', 'operate'] as const) {
    test(`every control shows, on two rows, and the ledger drops industry but keeps its bars (${theme})`, async ({ page }) => {
      await page.goto(`/?theme=${theme}`)
      const views = page.getByRole('group', { name: 'Chart view' })
      const metric = page.getByRole('group', { name: 'Metric' })
      const range = page.getByRole('group', { name: 'Time range' })
      const projection = page.getByRole('checkbox', { name: /Projection/ })
      for (const l of [views, metric, range, projection]) await expect(l).toBeVisible()
      // Views and metrics on the first row; projection and range on the second.
      expect(Math.abs((await mid(views)) - (await mid(metric)))).toBeLessThanOrEqual(2)
      expect(await mid(projection)).toBeGreaterThan((await mid(views)) + 10)
      expect(Math.abs((await mid(range)) - (await mid(projection)))).toBeLessThanOrEqual(2)

      const ledger = page.locator('table').last()
      await expect(ledger.getByRole('columnheader', { name: /Industry/ })).toBeHidden()
      await expect(ledger.getByRole('columnheader', { name: /EV\/EBITDA/ })).toBeVisible()
      // The bars stay laid out (an idle one may be empty, so not "visible").
      expect(await ledger.locator('[data-bar]').first().evaluate(e => getComputedStyle(e).display)).not.toBe('none')
      // 820 puts the ledger near 749px, inside the band where one threshold
      // at 46rem kept the text column and the clip cut EV/EBITDA.
      const fits = await ledger.evaluate(t => t.getBoundingClientRect().right <= t.parentElement!.getBoundingClientRect().right + 0.5)
      expect(fits).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      const results = await (await axe(page)).analyze()
      expect(results.violations).toEqual([])
    })
  }
})
