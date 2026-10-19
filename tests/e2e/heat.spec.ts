import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M12 step 3 on the Worker runtime, fixtures mode: the hero's Heat view
// (decisions/2026-10-19-heat-measures-moves-in-sigma.md,
// decisions/2026-10-19-heat-diverges-blue-to-rust.md).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const heads = (page: import('@playwright/test').Page) => page.locator('[data-heat] thead th')

test.describe('the Heat view', () => {
  test('shows every row in buckets the range sets, from the switch and in the URL', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: 'Heat' }).click()
    await expect(page).toHaveURL('/?view=heat')
    await expect(page.locator('[data-heat] tbody tr')).toHaveCount(12)
    await expect(heads(page)).toHaveCount(14) // the corner and thirteen weeks
    await expect(page.locator('[data-heat-caption]')).toContainText('week')
    await expect(page.locator('[data-strip-note]')).toContainText('charted')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    // The week grid crossfades out as the day grid comes in; then one.
    await expect(page.locator('[data-heat]')).toHaveCount(1)
    await expect(page.locator('[data-heat]')).toHaveAttribute('data-unit', 'day')
    // A day each across the month, give or take the month's length.
    expect(await heads(page).count()).toBeGreaterThanOrEqual(29)
  })

  test('every outlier carries its dot, and no other cell does', async ({ page }) => {
    await page.goto('/?view=heat')
    await expect(page.locator('[data-cell]')).toHaveCount(156)
    const mismatch = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-cell]')].filter(b => {
        const z = b.dataset.z === undefined ? 0 : Math.abs(Number(b.dataset.z))
        return (z >= 2) !== (b.querySelector('span') !== null)
      }).length,
    )
    expect(mismatch).toBe(0)
  })

  test('rows follow the ledger\'s sort', async ({ page }) => {
    await page.goto('/?view=heat&sort=name&dir=desc')
    await expect(page.locator('[data-heat] tbody tr')).toHaveCount(12)
    const heat = await page.locator('[data-heat] tbody tr').evaluateAll(trs => trs.map(t => t.getAttribute('data-row')))
    const ledger = await page.locator('[data-entity-link]').evaluateAll(as => as.map(a => a.getAttribute('data-entity-link')))
    expect(heat).toEqual(ledger)
  })

  test('the keyboard walks the grid, reads the cell, and a pick opens Over time on that row and week', async ({ page }) => {
    await page.goto('/?view=heat')
    await expect(page.locator('[data-cell][tabindex="0"]')).toHaveCount(1)
    await page.locator('[data-cell][tabindex="0"]').focus()
    const first = await page.evaluate(() => document.activeElement?.getAttribute('data-cell'))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    const now = await page.evaluate(() => document.activeElement?.getAttribute('data-cell'))
    expect(now).not.toBe(first)
    await expect(page.getByTestId('heat-readout')).toContainText('σ')
    await expect(page.locator('tbody tr[data-hover]')).toHaveCount(2) // the heat row and its ledger row
    const [id] = now!.split(':')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/)
    await expect(page.locator(`path[data-series="${id}"][data-drawn]`)).toHaveCount(1)
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('listitem').first()).toContainText(await page.locator(`[data-entity-link="${id}"]`).innerText())
  })

  test('the grid reveals from the left', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const insets = await page.evaluate(async () => {
      ;([...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => b.textContent === 'Heat') as HTMLButtonElement).click()
      const seen: number[] = []
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const el = document.querySelector('[data-heat]')?.parentElement
        const m = el ? getComputedStyle(el).clipPath.match(/inset\(0(?:px)? ([\d.]+)%/) : null
        if (m) seen.push(Number(m[1]))
      }
      return seen
    })
    expect(Math.max(...insets)).toBeGreaterThan(50)
    expect(insets.filter(v => v > 0 && v < 100).length).toBeGreaterThan(5)
    expect(insets[insets.length - 1]).toBe(0)
  })

  test('passes axe in Heat, on both stocks', async ({ page }) => {
    for (const theme of ['passbook', 'operate']) {
      await page.goto(`/?view=heat&theme=${theme}`)
      await expect(page.locator('[data-cell]')).toHaveCount(156)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations, theme).toEqual([])
    }
  })
})
