import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M6 acceptance on the Worker runtime, fixtures mode: toggling a row draws
// or removes its ribbon; a range change animates the domain; keyboard focus
// on a row reads the point; axe clean with ribbons drawn; reduced motion
// makes both instant.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const plot = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Chart' }).getByRole('img', { name: /rows?|No rows/ })

test.describe('the chart', () => {
  test('toggling a row draws its ribbon, its endpoint, and its legend entry; toggling again removes them', async ({ page }) => {
    await page.goto('/')
    await expect(plot(page)).toHaveAttribute('aria-label', /^No rows charted/)
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    const ribbon = page.locator('path[data-series="ou-tokyo"]')
    await expect(ribbon).toHaveCount(1)
    // A real path over real dates: many segments, drawn in on slower / enter.
    expect((await ribbon.getAttribute('d'))!.split('L').length).toBeGreaterThan(20)
    await expect(ribbon).toHaveAttribute('data-drawn')
    await expect(page.locator('[data-endpoint="ou-tokyo"]')).toBeVisible()
    await expect(plot(page)).toHaveAttribute('aria-label', /^Level over 1Y, 1 row: Anchor Kaze [\d.,]+\. History from 2026-06-01\. Values from \d{4}-\d{2}-\d{2} are provisional\. The table below is the accessible alternative\.$/)
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await expect(ribbon).toHaveCount(0)
    await expect(page.locator('[data-endpoint="ou-tokyo"]')).toHaveCount(0)
    await expect(plot(page)).toHaveAttribute('aria-label', /^No rows charted/)
  })

  test('the legend removes a ribbon, and the ninth selected row waits', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Select all rows' }).click()
    await expect(page.locator('path[data-series]')).toHaveCount(8)
    await expect(page.getByRole('list', { name: 'Selected rows' })).toContainText('4 more selected, not charted')
    await page.getByRole('button', { name: 'Remove Anchor Kaze from the chart' }).click()
    await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveCount(0)
    await expect(page.locator('path[data-series]')).toHaveCount(8)
  })

  test('a range change animates the domain and lands on the new window', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    const ribbon = page.locator('path[data-series="ou-tokyo"]')
    await expect(ribbon).toHaveAttribute('data-drawn')
    const svg = page.locator('svg[preserveAspectRatio="none"]')
    const before = await ribbon.getAttribute('d')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    // The rescale is in flight (slow / standard), then settles.
    await expect(svg).toHaveAttribute('data-animating', '')
    await expect(svg).not.toHaveAttribute('data-animating', '')
    const after = await ribbon.getAttribute('d')
    expect(after).not.toBe(before)
    await expect(plot(page)).toHaveAttribute('aria-label', /Level over 1M/)
    await expect(page).toHaveURL('/?range=1M')
    // Mid-flight the path is neither the old nor the new one.
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: 'Max' }).click()
    await expect(svg).toHaveAttribute('data-animating', '')
    // The flag is set before the first frame moves; sample a few frames in.
    await page.waitForTimeout(120)
    const mid = await ribbon.getAttribute('d')
    await expect(svg).not.toHaveAttribute('data-animating', '')
    const final = await ribbon.getAttribute('d')
    expect(mid).not.toBe(after)
    expect(mid).not.toBe(final)
  })

  test('keyboard focus on a row reads its point, and lifts its ribbon', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
    const readout = page.getByTestId('chart-readout')
    // Focus moves to another row's checkbox: the readout reads that row.
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).focus()
    await expect(readout).toContainText('Anchor Kaze')
    const figure = (await page.getByRole('button', { name: /^Level for Anchor Kaze/ }).getAttribute('aria-label'))!
    const value = figure.match(/: ([\d.,()−]+),/)![1]!
    await expect(readout).toContainText(value)
    // The point's date is the run's today (the preview runs on the clock).
    await expect(readout).toContainText(/\d{4}-\d{2}-\d{2}/)
    await expect(readout).toHaveAttribute('role', 'status')
    await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveAttribute('data-hover')
    await expect(page.locator('path[data-series="ou-london"]')).not.toHaveAttribute('data-hover')
    // A row that is not charted still reads.
    await page.getByRole('checkbox', { name: 'Chart Plumb Varsha' }).focus()
    await expect(readout).toContainText('Plumb Varsha')
    // Focus leaving the ledger clears it.
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1Y' }).focus()
    await expect(readout).toBeEmpty()
  })

  test('hovering a ribbon marks its row, and the drawer mutes the others', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
    await expect(page.locator('path[data-series="ou-london"]')).toHaveAttribute('data-drawn')
    // The pointer on the ribbon itself: a point along its geometry, mapped
    // from the SVG's viewBox to the screen, so the wide hit stroke beneath
    // takes the hover.
    const spot = await page.locator('path[data-series="ou-london"] + path').evaluate(p => {
      const path = p as SVGPathElement
      const at = path.getPointAtLength(path.getTotalLength() * 0.7)
      const svg = path.ownerSVGElement!
      const r = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      return { x: r.left + (at.x / vb.width) * r.width, y: r.top + (at.y / vb.height) * r.height }
    })
    await page.mouse.move(spot.x, spot.y)
    await expect(page.locator('tbody tr').filter({ hasText: 'Keel London' })).toHaveAttribute('data-hover')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await expect(page.locator('path[data-series="ou-london"]')).toHaveAttribute('data-muted')
    await expect(page.locator('path[data-series="ou-tokyo"]')).not.toHaveAttribute('data-muted')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('path[data-series="ou-london"]')).not.toHaveAttribute('data-muted')
  })

  test('the regions dataset charts on its own series, read after the switch', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Regions' }).click()
    await page.getByRole('checkbox', { name: 'Chart Brooklyn' }).click()
    const ribbon = page.locator('path[data-series="brooklyn"]')
    await expect(ribbon).toHaveAttribute('data-drawn')
    await expect(plot(page)).toHaveAttribute('aria-label', /^Index over 1Y, 1 row: Brooklyn/)
  })

  test('passes axe with ribbons drawn, the readout up, and the drawer open', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Select all rows' }).click()
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(8)
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).focus()
    await expect(page.getByTestId('chart-readout')).toContainText('Anchor Kaze')
    await page.screenshot({ path: 'test-results/chart-eight.png' })
    let results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('under reduced motion the draw-in and the rescale are instant', async ({ page }) => {
    await page.goto('/?reduce=1')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    const ribbon = page.locator('path[data-series="ou-tokyo"]')
    // The draw-in is slower (600 ms) with motion; here it is done at once.
    await expect(ribbon).toHaveAttribute('data-drawn', { timeout: 250 })
    const svg = page.locator('svg[preserveAspectRatio="none"]')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    // The rescale is slow (400 ms) with motion; here it has settled at once.
    await expect.poll(async () => (await svg.getAttribute('data-animating')) === null, { timeout: 250 }).toBe(true)
    await expect(plot(page)).toHaveAttribute('aria-label', /Level over 1M/)
  })
})
