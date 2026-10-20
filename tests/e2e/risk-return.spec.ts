import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The hero's view switch and the Risk / return view on the Worker runtime,
// fixtures mode (decisions/2026-10-19-views-in-the-hero.md,
// decisions/2026-10-19-risk-return-reads-level.md,
// decisions/2026-10-20-the-views-draw-the-selection.md,
// decisions/2026-10-20-each-view-keeps-its-own-markers.md).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const views = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Chart view' })

// Every marker element on the page, frame by frame across a view switch:
// the largest move any one element makes. Each view's markers are its own,
// so none should move at all; the old leave with their view, the new arrive.
async function markerMoves(page: import('@playwright/test').Page, to: string) {
  return page.evaluate(async to => {
    const seen = new Map<Element, Array<[number, number]>>()
    const sample = () => {
      for (const m of document.querySelectorAll('[data-endpoint] > span, [data-point] [data-mark]')) {
        const b = m.getBoundingClientRect()
        const k = seen.get(m) ?? []
        k.push([b.left, b.top])
        seen.set(m, k)
      }
    }
    sample()
    ;([...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => b.textContent === to) as HTMLButtonElement).click()
    for (let i = 0; i < 50; i++) {
      await new Promise(r => requestAnimationFrame(r))
      sample()
    }
    let max = 0
    for (const k of seen.values()) for (let i = 1; i < k.length; i++) max = Math.max(max, Math.hypot(k[i]![0] - k[i - 1]![0], k[i]![1] - k[i - 1]![1]))
    return max
  }, to)
}

test.describe('the hero views', () => {
  test('the switch shows Risk / return, in the URL and across a reload, with a caption for the metric chips', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await views(page).getByRole('button', { name: 'Risk / return' }).click()
    await expect(page).toHaveURL('/?view=risk')
    await expect(views(page).getByRole('button', { name: 'Risk / return' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Metric' })).toHaveCount(0)
    await expect(page.locator('[data-risk-caption]')).toContainText(/from Level · \d+ d/)
    await expect(page.locator('[data-point]')).toHaveCount(4)
    await page.reload()
    await expect(page.locator('[data-point]')).toHaveCount(4)
    await views(page).getByRole('button', { name: 'Trend' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await expect(page.getByRole('group', { name: 'Metric' })).toBeVisible()
  })

  // A marker that flew from the line's end to its point read as an error
  // (David, 2026-10-20); measured, it also jumped mid-flight.
  test('no marker moves on a switch: each view\'s markers leave and arrive with it', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await page.waitForTimeout(800)
    for (const to of ['Risk / return', 'Trend', 'Heat', 'Risk / return', 'Trend']) {
      // A few pixels as Trend's plot settles to its measured size, while its
      // endpoints are still unseen; never a flight.
      expect(await markerMoves(page, to), to).toBeLessThanOrEqual(4)
      await page.waitForTimeout(600)
    }
    await expect(page.locator('[data-endpoint]')).toHaveCount(4)
  })

  test('only the charted rows are drawn, against axes every row sets; ticking a row never rescales', async ({ page }) => {
    await page.goto('/?view=risk&metric=change')
    await expect(page.locator('[data-point]')).toHaveCount(4)
    const charted = await page.locator('tbody input[type="checkbox"]:checked').count()
    expect(charted).toBe(4)
    const rows = page.locator('[data-risk-table] tbody tr')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toContainText(/[+−]\d+\.\d%/)
    await expect(page.locator('[data-risk-table] caption')).toContainText('from Level')
    // The metric in the URL is Δ 1d; the view reads Level all the same.
    await expect(page.locator('[data-risk-caption]')).toContainText('from Level')
    await page.waitForTimeout(800)
    const axes = () => page.evaluate(() => [...document.querySelectorAll('[class*="yTick"], [class*="xTick"]')].map(t => `${t.textContent}@${Math.round(t.getBoundingClientRect().left)},${Math.round(t.getBoundingClientRect().top)}`).join(' '))
    const before = await axes()
    await page.locator('[data-entity-link="ou-london"]').locator('xpath=ancestor::tr[1]').getByRole('checkbox').check()
    await expect(page.locator('[data-point]')).toHaveCount(5)
    await expect(page.locator('[data-point="ou-london"]')).toHaveCount(1)
    await page.waitForTimeout(600)
    expect(await axes()).toBe(before)
    await page.locator('[data-entity-link="ou-london"]').locator('xpath=ancestor::tr[1]').getByRole('checkbox').uncheck()
    await expect(page.locator('[data-point]')).toHaveCount(4)
  })

  test('with nothing charted the frame stays and asks for a selection', async ({ page }) => {
    await page.goto('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(4)
    await page.getByRole('checkbox', { name: 'Deselect all rows' }).click()
    await expect(page.locator('[data-point]')).toHaveCount(0)
    await expect(page.locator('[data-risk-return]')).toContainText('Select rows in the table to place them.')
    await expect(page.locator('[class*="yTick"]').first()).toBeVisible()
  })

  test('hovering a point lifts its ledger row, and hovering a row rings its point', async ({ page }) => {
    await page.goto('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(4)
    await page.waitForTimeout(600)
    const mark = page.locator('[data-point="ou-tokyo"] [data-mark]')
    const box = (await mark.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('tbody tr[data-hover]')).toContainText('Anchor Kaze')
    await expect(page.getByTestId('risk-card')).toContainText('Anchor Kaze')
    await expect(page.getByTestId('risk-readout')).toContainText('vol')
    await page.mouse.move(0, 0)
    await page.locator('[data-entity-link="ou-mumbai"]').hover()
    await expect(page.locator('[data-point="ou-mumbai"][data-hover]')).toHaveCount(1)
  })

  test('passes axe in Risk / return', async ({ page }) => {
    await page.goto('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(4)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('under reduced motion the points are simply there', async ({ page }) => {
    await page.goto('/?reduce=1')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await views(page).getByRole('button', { name: 'Risk / return' }).click()
    await expect(page.locator('[data-point]')).toHaveCount(4)
    await page.waitForTimeout(100)
    const opacity = await page.locator('[data-point]').first().evaluate(e => Number(getComputedStyle(e).opacity))
    expect(opacity).toBe(1)
  })
})
