import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M12 step 2 on the Worker runtime, fixtures mode: the hero's view switch
// and the Risk / return view (decisions/2026-10-19-views-in-the-hero.md,
// decisions/2026-10-19-risk-return-reads-level.md).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const views = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Chart view' })

// A charted row's marker, frame by frame, across a view switch.
async function travelFrames(page: import('@playwright/test').Page, to: string, id: string) {
  return page.evaluate(
    async ({ to, id }) => {
      const btn = [...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => b.textContent?.includes(to)) as HTMLButtonElement
      const at = () => {
        const m = document.querySelector(`[data-point="${id}"] [data-mark], [data-endpoint="${id}"] > span`)
        if (!m) return null
        const r = m.getBoundingClientRect()
        return [Math.round(r.left), Math.round(r.top)] as [number, number]
      }
      const out = [at()]
      btn.click()
      for (let i = 0; i < 70; i++) {
        await new Promise(r => requestAnimationFrame(r))
        out.push(at())
      }
      return out
    },
    { to, id },
  )
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
    await expect(page.locator('[data-point]')).toHaveCount(12)
    await expect(page.locator('[data-strip-note]')).toContainText('tools cover the 4 charted rows')
    await page.reload()
    await expect(page.locator('[data-point]')).toHaveCount(12)
    await views(page).getByRole('button', { name: 'Over time' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await expect(page.getByRole('group', { name: 'Metric' })).toBeVisible()
  })

  test('a charted marker travels from its endpoint to its point and back', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await page.waitForTimeout(300)
    for (const to of ['Risk / return', 'Over time']) {
      const frames = (await travelFrames(page, to, 'ou-tokyo')).filter((p): p is [number, number] => p !== null)
      const first = frames[0]!
      const last = frames[frames.length - 1]!
      expect(Math.hypot(last[0] - first[0], last[1] - first[1]), to).toBeGreaterThan(40)
      // Travelling, not a jump: many frames strictly between the two ends.
      const between = frames.filter(p => (p[0] !== first[0] || p[1] !== first[1]) && (p[0] !== last[0] || p[1] !== last[1])).length
      expect(between, to).toBeGreaterThan(5)
    }
    await expect(page.locator('[data-endpoint]')).toHaveCount(4)
  })

  test('every row is plotted from Level, and the table under it carries the numbers', async ({ page }) => {
    await page.goto('/?view=risk&metric=change')
    await expect(page.locator('[data-point]')).toHaveCount(12)
    const rows = page.locator('[data-risk-table] tbody tr')
    await expect(rows).toHaveCount(12)
    await expect(rows.first()).toContainText(/[+−]\d+\.\d%/)
    await expect(page.locator('[data-risk-table] caption')).toContainText('from Level')
    // The metric in the URL is Δ 1d; the view reads Level all the same.
    await expect(page.locator('[data-risk-caption]')).toContainText('from Level')
  })

  test('hovering a point lifts its ledger row, and hovering a row rings its point', async ({ page }) => {
    await page.goto('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(12)
    await page.waitForTimeout(600)
    const mark = page.locator('[data-point="ou-tokyo"] [data-mark]')
    const box = (await mark.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('tbody tr[data-hover]')).toContainText('Anchor Kaze')
    await expect(page.getByTestId('risk-card')).toContainText('Anchor Kaze')
    await expect(page.getByTestId('risk-readout')).toContainText('vol')
    await page.mouse.move(0, 0)
    await page.locator('[data-entity-link="ou-london"]').hover()
    await expect(page.locator('[data-point="ou-london"][data-hover]')).toHaveCount(1)
  })

  test('passes axe in Risk / return', async ({ page }) => {
    await page.goto('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(12)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('under reduced motion the markers land at once', async ({ page }) => {
    await page.goto('/?reduce=1')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const frames = (await travelFrames(page, 'Risk / return', 'ou-tokyo')).filter((p): p is [number, number] => p !== null)
    const last = frames[frames.length - 1]!
    expect(frames.slice(4).every(p => p[0] === last[0] && p[1] === last[1])).toBe(true)
  })
})

// M13 (decisions/2026-10-20-two-breakpoints-640-and-900.md): at a phone's
// width no view scrolls the page sideways. Risk / return did: its
// screen-reader table carried .sr-only itself, and a table ignores
// width: 1px, so it laid out about 315px past the edge.
test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  for (const [view, ready] of [
    ['time', 'path[data-series][data-drawn]'],
    ['risk', '[data-point]'],
    ['heat', '[data-heat]'],
  ] as const) {
    test(`?view=${view} does not scroll sideways`, async ({ page }) => {
      await page.goto(`/?view=${view}`)
      await expect(page.locator(ready).first()).toBeVisible()
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }))
      expect(sw).toBeLessThanOrEqual(cw)
    })
  }
})
