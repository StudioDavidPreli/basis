import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M12's acceptance check, the parts no step's own spec covered (plan.md,
// M12): ⌘K switches the hero's view and the projection, and every new
// surface is axe clean on both stocks in both reduced-motion states. The
// rest of the check lives with its step: the bar (table.spec), the view in
// the URL and the markers that stay with their view (risk-return.spec), heat's order and pick
// (heat.spec), the fan's shape (lib/projection.test), the waterfall's sum
// and remainder (lib/diagnostics, diagnostics.spec).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' })
const input = (page: Page) => palette(page).getByRole('combobox', { name: 'Command or name' })

async function hydrated(page: Page) {
  await page.getByRole('button', { name: 'Command palette' }).evaluate(e => new Promise<void>(done => {
    const check = () => (Object.keys(e).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
    check()
  }))
}

async function run(page: Page, query: string) {
  await hydrated(page)
  await page.keyboard.press('ControlOrMeta+k')
  await expect(input(page)).toBeFocused()
  await input(page).fill(query)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
}

test.describe('M12 acceptance', () => {
  test('⌘K switches the hero\'s view, and shows and hides the projection', async ({ page }) => {
    await page.goto('/')
    await run(page, 'show risk')
    await expect(page).toHaveURL('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(4)
    await run(page, 'show heat')
    await expect(page).toHaveURL('/?view=heat')
    await expect(page.locator('[data-heat]')).toHaveCount(1)
    await run(page, 'show trend')
    await expect(page).toHaveURL('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await run(page, 'show the projection')
    await expect(page).toHaveURL('/?proj=1')
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    await run(page, 'hide the projection')
    await expect(page.locator('[data-fan]')).toHaveCount(0)
  })

  // Each new surface, on both stocks, with motion and with reduced motion.
  const surfaces: Array<[string, string, (p: Page) => Promise<void>]> = [
    ['ledger bars, one kept', '/?sort=change&dir=desc&bars=level', async p => expect(p.locator('tbody [data-bar="on"]')).toHaveCount(24)],
    ['Risk / return', '/?view=risk', async p => expect(p.locator('[data-point]')).toHaveCount(4)],
    ['Heat', '/?view=heat', async p => expect(p.locator('[data-cell]')).toHaveCount(52)],
    ['the projection', '/?proj=1', async p => expect(p.locator('[data-fan]')).toHaveCount(4)],
    ['the waterfall', '/?tool=attribution', async p => expect(p.locator('[data-waterfall]')).toHaveCount(4)],
  ]
  for (const theme of ['passbook', 'operate']) {
    for (const reduce of ['0', '1']) {
      test(`axe is clean on every new surface: ${theme}, reduced motion ${reduce === '1' ? 'on' : 'off'}`, async ({ page }) => {
        for (const [name, url, ready] of surfaces) {
          await page.goto(`${url}${url.includes('?') ? '&' : '?'}theme=${theme}&reduce=${reduce}`)
          await ready(page)
          // Let the entries land, so axe reads the settled page.
          await page.waitForTimeout(reduce === '1' ? 100 : 1200)
          const results = await new AxeBuilder({ page }).analyze()
          expect(results.violations, name).toEqual([])
        }
      })
    }
  }
})
