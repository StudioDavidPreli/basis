import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M8 acceptance on the Worker runtime, fixtures mode: every palette action
// reachable by keyboard; axe clean in both themes, with the palette open,
// in both reduced-motion states; a narrow viewport screenshot per stock.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' })
const input = (page: Page) => palette(page).getByRole('combobox', { name: 'Command or name' })

// Open from the keyboard, type, run the active option with Enter, and wait
// for the palette to have gone: an action runs after the close.
async function run(page: Page, query: string) {
  await page.keyboard.press('ControlOrMeta+k')
  await expect(input(page)).toBeFocused()
  await input(page).fill(query)
  await page.keyboard.press('Enter')
  await expect(palette(page)).toHaveCount(0)
}

test.describe('the command palette', () => {
  test('⌘K opens it on the combobox; Escape closes it and returns focus to the hint', async ({ page }) => {
    await page.goto('/')
    const hint = page.getByRole('button', { name: 'Command palette' })
    await expect(hint).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K')
    await hint.focus()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette(page)).toBeVisible()
    await expect(input(page)).toBeFocused()
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(palette(page)).toHaveCount(0)
    await expect(hint).toBeFocused()
    // The hint itself opens it too, and ⌘K inside closes it.
    await page.keyboard.press('Enter')
    await expect(input(page)).toBeFocused()
    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette(page)).toHaveCount(0)
    await expect(hint).toBeFocused()
  })

  test('the arrows move the active option, which the combobox names', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('ControlOrMeta+k')
    const options = palette(page).getByRole('option')
    const first = await options.nth(0).getAttribute('id')
    const second = await options.nth(1).getAttribute('id')
    const last = await options.last().getAttribute('id')
    await expect(input(page)).toHaveAttribute('aria-activedescendant', first!)
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(input(page)).toHaveAttribute('aria-activedescendant', second!)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    // Wraps from the first to the last.
    await expect(input(page)).toHaveAttribute('aria-activedescendant', last!)
    // Typing filters and resets the active option to the first match.
    await input(page).fill('zzzz')
    await expect(options).toHaveCount(0)
    await expect(palette(page).getByText('No matches.')).toBeVisible()
    await input(page).fill('keel')
    await expect(options).toHaveCount(1)
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  })

  test('jump to a company opens its drawer with focus on the heading', async ({ page }) => {
    await page.goto('/')
    await run(page, 'keel')
    const drawer = page.getByRole('dialog', { name: /Keel London/ })
    await expect(drawer).toBeVisible()
    await expect(page).toHaveURL(/\/company\/[^/?]+/)
    await expect(drawer.locator('[data-drawer-heading]')).toBeFocused()
    // With a drawer open, a jump switches it in place, and back closes it
    // rather than stepping through entities.
    await run(page, 'plumb')
    await expect(page.getByRole('dialog', { name: /Plumb Varsha/ })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/localhost:\d+\/(\?|$)/)
  })

  test('switch the dataset and the time range; both reach the URL', async ({ page }) => {
    await page.goto('/')
    await run(page, 'show regions')
    await expect(page.getByRole('button', { name: 'Regions', pressed: true })).toBeVisible()
    await expect(page).toHaveURL(/dataset=regions/)
    await run(page, 'last 5y')
    await expect(page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '5Y' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/range=5Y/)
    // The current choice is tagged in the list.
    await page.keyboard.press('ControlOrMeta+k')
    await input(page).fill('5y')
    await expect(palette(page).getByRole('option', { name: /Last 5Y/ })).toContainText('current')
  })

  test('switch the chart metric', async ({ page }) => {
    await page.goto('/')
    await run(page, 'chart ev/ebitda')
    await expect(page.getByRole('group', { name: 'Metric' }).getByRole('button', { name: 'EV/EBITDA' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/metric=multiple/)
  })

  test('toggle the stock; the choice persists', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-theme', 'passbook')
    await run(page, 'dark stock')
    await expect(html).toHaveAttribute('data-theme', 'operate')
    await page.reload()
    await expect(html).toHaveAttribute('data-theme', 'operate')
    await run(page, 'light stock')
    await expect(html).toHaveAttribute('data-theme', 'passbook')
  })

  test('reduce motion on and off; the choice persists', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-reduce-motion', '0')
    await run(page, 'reduce motion')
    await expect(html).toHaveAttribute('data-reduce-motion', '1')
    await page.reload()
    await expect(html).toHaveAttribute('data-reduce-motion', '1')
    await run(page, 'reduced motion off')
    await expect(html).toHaveAttribute('data-reduce-motion', '0')
    await page.reload()
    await expect(html).toHaveAttribute('data-reduce-motion', '0')
  })

  test('under the system preference the toggle says so and cannot turn it off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-reduce-motion', '1')
    await page.keyboard.press('ControlOrMeta+k')
    await input(page).fill('motion')
    const option = palette(page).getByRole('option', { name: 'Reduced motion: on (system setting)' })
    await expect(option).toHaveAttribute('aria-disabled', 'true')
    // Enter on a disabled option does nothing: the palette stays.
    await page.keyboard.press('Enter')
    await expect(palette(page)).toBeVisible()
    await expect(html).toHaveAttribute('data-reduce-motion', '1')
  })
})

test.describe('axe with the palette open', () => {
  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`${theme}, reduced motion ${reduce ? 'on' : 'off'}`, async ({ page }) => {
        await page.goto(`/?theme=${theme}${reduce ? '&reduce=1' : ''}`)
        await page.keyboard.press('ControlOrMeta+k')
        await expect(input(page)).toBeFocused()
        // Let the enter finish, so axe reads the settled colors.
        await expect(palette(page).locator('> div')).toHaveCSS('opacity', '1')
        const results = await new AxeBuilder({ page }).analyze()
        expect(results.violations).toEqual([])
      })
    }
  }
})

test.describe('the narrow viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const theme of ['passbook', 'operate'] as const) {
    test(`the ledger keeps the name, a sparkline, and the chart's metric (${theme})`, async ({ page }) => {
      await page.goto(`/?theme=${theme}`)
      const ledger = page.locator('table').last()
      // The chart's metric stays; the other figures and the text column go.
      await expect(ledger.getByRole('columnheader', { name: /Level/ })).toBeVisible()
      await expect(ledger.getByRole('columnheader', { name: /EV\/EBITDA/ })).toBeHidden()
      await expect(ledger.getByRole('columnheader', { name: /Industry/ })).toBeHidden()
      // One sparkline per row, drawn.
      const lines = ledger.locator('tbody svg[data-sparkline] path[d^="M"]')
      await expect(lines).toHaveCount(12)
      // No horizontal scroll, and nothing clipped: the ledger's wrap clips
      // overflow, so a table wider than it would cut the figures silently.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      const fits = await ledger.evaluate(t => t.getBoundingClientRect().right <= t.parentElement!.getBoundingClientRect().right + 0.5)
      expect(fits).toBe(true)
      // The chart keeps the range control only.
      await expect(page.getByRole('group', { name: 'Time range' })).toBeVisible()
      await expect(page.getByRole('group', { name: 'Metric' })).toBeHidden()
      await page.screenshot({ path: `test-results/narrow-${theme}.png`, fullPage: true })
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('the sparkline follows the chart metric and the range', async ({ page }) => {
    await page.goto('/')
    const spark = page.locator('table').last().locator('tbody tr').first().locator("svg[data-sparkline] path")
    const year = await spark.getAttribute('d')
    await page.goto('/?range=1M')
    await expect(spark).not.toHaveAttribute('d', year!)
    await page.goto('/?metric=multiple')
    await expect(page.locator('table').last().getByRole('columnheader', { name: /EV\/EBITDA/ })).toBeVisible()
    await expect(page.locator('table').last().getByRole('columnheader', { name: /Level/ })).toBeHidden()
  })
})
