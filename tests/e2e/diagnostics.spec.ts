import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { landEmpty } from './land'

// M11 acceptance on the Worker runtime, fixtures mode (plan.md): hovering
// a tool raises its card and clicking pins it, Escape unpins; typing two
// dates or dragging on the plot sets the window, which lands in the URL,
// survives a chip change, and clears on Reset; a diagnostic figure's
// popover names both inputs; axe clean with a panel pinned.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

async function chartTwo(page: import('@playwright/test').Page) {
  await landEmpty(page, '/?range=Max')
  await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
  await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
  await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(2)
}

test.describe('the diagnostics strip', () => {
  test('six tools; a hover raises the card, a click pins it, Escape unpins', async ({ page }) => {
    await chartTwo(page)
    const tools = page.getByRole('group', { name: 'Tools' }).getByRole('button')
    await expect(tools).toHaveCount(6)
    const summary = page.getByRole('button', { name: 'Range summary' })
    await summary.hover()
    const panel = page.getByTestId('diagnostics-panel')
    await expect(panel).toBeVisible()
    await expect(panel).not.toHaveAttribute('data-pinned')
    await expect(panel.getByRole('heading', { name: 'Range summary' })).toBeVisible()
    await expect(panel.getByRole('rowheader', { name: /Anchor Kaze/ })).toBeVisible()
    await expect(panel.getByRole('rowheader', { name: /Keel London/ })).toBeVisible()
    // Every number is a Figure with its provenance: this one names both inputs.
    const change = panel.getByRole('button', { name: /^Change over the window, Level for Anchor Kaze/ })
    await change.click()
    const dialog = page.getByRole('dialog', { name: 'Provenance' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Open-Meteo')
    await expect(dialog).toContainText('Frankfurter')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // Pin.
    await summary.click()
    await expect(summary).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).toHaveAttribute('data-pinned', '')
    await expect(page).toHaveURL(/tool=summary/)
    await page.mouse.move(5, 5)
    await expect(panel).toBeVisible()
    // Another tool hovered shows in the pinned slot, then the pinned one returns.
    await page.getByRole('button', { name: 'Anomalies' }).hover()
    await expect(panel.getByRole('heading', { name: 'Anomalies' })).toBeVisible()
    await page.mouse.move(5, 5)
    await expect(panel.getByRole('heading', { name: 'Range summary' })).toBeVisible()
    // Escape unpins.
    await summary.focus()
    await page.keyboard.press('Escape')
    await expect(summary).toHaveAttribute('aria-expanded', 'false')
    await page.mouse.move(5, 5)
    await expect(panel).toHaveCount(0)
    await expect(page).not.toHaveURL(/tool=/)
  })

  test('the window: typed, it lands in the URL, survives a chip change, and clears on Reset', async ({ page }) => {
    await chartTwo(page)
    await expect(page.getByTestId('window-days')).toContainText('follows the view')
    await page.getByLabel('Window from', { exact: true }).fill('2026-06-12')
    await page.getByLabel('Window to', { exact: true }).fill('2026-08-30')
    await expect(page).toHaveURL(/from=2026-06-12&to=2026-08-30/)
    await expect(page.getByTestId('window-days')).toHaveText('80 d')
    await expect(page.locator('[data-window-shade]')).toHaveCount(1)
    await expect(page.locator('[data-window-handle]')).toHaveCount(2)
    await expect(page.locator('[data-window-tag]')).toHaveText(['2026-06-12', '2026-08-30'])
    // The tools read the window.
    await page.getByRole('button', { name: 'Range summary' }).hover()
    await expect(page.getByTestId('diagnostics-panel')).toContainText('80 d · Level')
    await page.mouse.move(5, 5)
    // The view changes; the window does not.
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '3M' }).click()
    await expect(page).toHaveURL(/range=3M&from=2026-06-12&to=2026-08-30/)
    await expect(page.getByTestId('window-days')).toHaveText('80 d')
    await page.getByRole('button', { name: '[ Reset ]' }).click()
    await expect(page).not.toHaveURL(/from=/)
    await expect(page.getByTestId('window-days')).toContainText('follows the view')
    await expect(page.locator('[data-window-shade]')).toHaveCount(0)
  })

  test('the window: dragged across the plot it is set on release; a click sets nothing', async ({ page }) => {
    await chartTwo(page)
    const box = (await page.locator('svg[preserveAspectRatio="none"]').boundingBox())!
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 })
    // The preview is up while dragging, with no committed window yet.
    await expect(page.locator('[data-window-preview]')).toHaveCount(1)
    await expect(page).not.toHaveURL(/from=/)
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 6 })
    await page.mouse.up()
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/)
    await expect(page.locator('[data-window-preview]')).toHaveCount(0)
    await expect(page.locator('[data-window-handle]')).toHaveCount(2)
    const url = page.url()
    // A press without a drag is a click.
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.5)
    await page.waitForTimeout(150)
    expect(page.url()).toBe(url)
  })

  test('a deep link restores the window and the pinned tool', async ({ page }) => {
    await landEmpty(page, '/?range=Max&from=2026-06-12&to=2026-08-30&tool=anomalies')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(1)
    await expect(page.getByTestId('window-days')).toHaveText('80 d')
    await expect(page.getByRole('button', { name: 'Anomalies' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('diagnostics-panel').getByRole('heading', { name: 'Anomalies' })).toBeVisible()
  })

  test('every tool answers for the charted rows', async ({ page }) => {
    await chartTwo(page)
    const panel = page.getByTestId('diagnostics-panel')
    for (const [name, expected] of [
      ['Relationships', /Anchor Kaze and Keel London/],
      ['Attribution', /From the base process/],
      ['Model check', /half-life/],
      ['Data quality', /Largest gap/],
      ['Anomalies', /Change point/],
    ] as const) {
      await page.getByRole('button', { name }).hover()
      await expect(panel.getByRole('heading', { name })).toBeVisible()
      await expect(panel).toContainText(expected)
      await page.mouse.move(5, 5)
    }
  })

  test('passes axe with a panel pinned and the window set', async ({ page }) => {
    await chartTwo(page)
    await page.getByLabel('Window from', { exact: true }).fill('2026-06-12')
    await page.getByLabel('Window to', { exact: true }).fill('2026-08-30')
    await page.getByRole('button', { name: 'Attribution' }).click()
    await page.mouse.move(5, 5)
    const panel = page.getByTestId('diagnostics-panel')
    await expect(panel).toHaveAttribute('data-pinned', '')
    await expect(panel).toHaveCSS('opacity', '1')
    await expect(page.locator('[data-window-shade]')).toHaveCSS('opacity', '1')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})
