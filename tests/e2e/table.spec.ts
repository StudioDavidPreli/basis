import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M4 acceptance on the Worker runtime, fixtures mode: sort via keyboard with
// aria-sort updating, Shift-range select, the provenance popover on hover
// and on click with Escape returning focus, the interruption banner at all
// three levels from fixtures, every status screenshotted, axe clean.

test.beforeEach(async ({ request }) => {
  // A clean, complete snapshot before every test.
  await request.post('/api/refresh')
})

test.describe('the ledger', () => {
  test('renders twelve numbered rows with sourced figures and passes axe', async ({ page }) => {
    await page.goto('/')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(12)
    await expect(rows.first()).toContainText('01')
    await expect(page.getByRole('rowheader', { name: /Anchor Kaze/ })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('sorts via keyboard and aria-sort follows', async ({ page }) => {
    await page.goto('/')
    const header = page.getByRole('columnheader', { name: /Level/ })
    await expect(header).toHaveAttribute('aria-sort', 'none')
    await header.getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    const first = await page.locator('tbody tr').first().getByRole('rowheader').textContent()
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    const firstDesc = await page.locator('tbody tr').first().getByRole('rowheader').textContent()
    expect(firstDesc).not.toBe(first)
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'none')
    await expect(page.getByTestId('live-region')).toContainText(/Sorted by Level/)
  })

  test('Shift-range selects a run of rows and the legend lists them', async ({ page }) => {
    await page.goto('/')
    const boxes = page.locator('tbody input[type="checkbox"]')
    await boxes.nth(1).click()
    await boxes.nth(4).click({ modifiers: ['Shift'] })
    for (const i of [1, 2, 3, 4]) await expect(boxes.nth(i)).toBeChecked()
    await expect(boxes.nth(0)).not.toBeChecked()
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('listitem')).toHaveCount(5) // four rows + clear
    const headerBox = page.locator('thead input[type="checkbox"]')
    expect(await headerBox.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true)
  })

  test('select-all takes every row; the chart holds eight and the legend says so', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Select all rows' }).click()
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(12)
    const legend = page.getByRole('list', { name: 'Selected rows' })
    await expect(legend).toContainText('4 more selected, not charted')
    await expect(legend.getByRole('button', { name: /Remove/ })).toHaveCount(8)
  })

  test('the sun/moon toggle swaps the stock and remembers it', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'passbook')
    await page.getByRole('button', { name: 'Switch to the dark stock' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'operate')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'operate')
    await page.getByRole('button', { name: 'Switch to the light stock' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'passbook')
  })

  test('the provenance popover: tooltip on hover, dialog on click, Escape returns focus', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    await trigger.hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('Open-Meteo')
    await expect(tip.getByRole('link', { name: /open the request/ }).first()).toHaveAttribute('href', /open-meteo/)
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Provenance' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('switching dataset shows the eight regions', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(8)
    await expect(page.getByRole('rowheader', { name: /Brooklyn/ })).toBeVisible()
  })
})

test.describe('every status has a screenshot', () => {
  for (const status of ['current', 'stale', 'refreshing', 'agent-updated', 'unverified']) {
    test(status, async ({ page }) => {
      await page.goto(`/embed/figure?status=${status}`)
      const figure = page.locator('[data-status]').first()
      await expect(figure).toHaveAttribute('data-status', status)
      await page.waitForTimeout(700)
      await page.screenshot({ path: `test-results/status-${status}.png` })
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }
})

test.describe('the interruption banner, from fixtures', () => {
  test('one source failing', async ({ page, request }) => {
    await request.post('/api/refresh?fail=noaa-coops')
    await page.goto('/')
    const banner = page.getByRole('status')
    await expect(banner).toContainText('NOAA CO-OPS is not answering')
    await expect(banner).toContainText('HTTP 503')
    await page.screenshot({ path: 'test-results/banner-source.png' })
  })

  test('every source failing', async ({ page, request }) => {
    await request.post('/api/refresh?fail=all')
    await page.goto('/')
    await expect(page.getByRole('status')).toContainText('No source is answering')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.screenshot({ path: 'test-results/banner-all.png' })
  })

  test('the handler throwing', async ({ page, request }) => {
    const res = await request.post('/api/refresh?fail=handler')
    expect(res.status()).toBe(500)
    await page.goto('/')
    await expect(page.getByRole('status')).toContainText('The last refresh failed')
    await page.screenshot({ path: 'test-results/banner-handler.png' })
  })

  test('a clean run clears the banner', async ({ page, request }) => {
    await request.post('/api/refresh?fail=all')
    await request.post('/api/refresh')
    await page.goto('/')
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})
