import { test, expect } from '@playwright/test'
import { axe } from './land'

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
    const results = await (await axe(page)).analyze()
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

// Every marker arrives (M14 step 6; decisions/2026-10-21-markers-arrive-by-
// rank.md). David saw markers that never arrived; each way into the view is
// walked here and every drawn point must reach opacity 1. On the view's
// arrival the points come in the ledger's order.
test.describe('every Risk / return marker arrives', () => {
  const settle = (page: import('@playwright/test').Page, ms = 1200) => page.waitForTimeout(ms)
  const drawnOpacities = (page: import('@playwright/test').Page) =>
    page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-risk-return] [data-point]')].map(p => ({ id: p.dataset['point']!, o: Number(getComputedStyle(p).opacity) })))
  const allArrived = async (page: import('@playwright/test').Page, how: string) => {
    const drawn = await drawnOpacities(page)
    expect(drawn.length, how).toBeGreaterThan(0)
    for (const d of drawn) expect(d.o, `${how}: ${d.id}`).toBe(1)
  }
  const view = (page: import('@playwright/test').Page, name: string) => views(page).getByRole('button', { name })

  test('on arrival, in the ledger\'s order, and by every other way in', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)

    // Chart four rows bottom-up, so selection order is the ledger's reversed
    // and the two orders cannot be confused.
    await page.evaluate(async () => {
      const boxes = () => [...document.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')]
      for (const b of boxes()) if (b.checked) b.click()
      await new Promise(r => setTimeout(r, 100))
      for (const i of [7, 5, 3, 1]) {
        boxes()[i]!.click()
        await new Promise(r => setTimeout(r, 50))
      }
    })
    await expect(page.locator('tbody input[type=checkbox]:checked')).toHaveCount(4)

    // Arrival: each charted point reaches full opacity, in ledger order.
    const order = await page.evaluate(async () => {
      ;([...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => /risk/i.test(b.textContent ?? '')) as HTMLButtonElement).click()
      const full = new Map<string, number>()
      const t0 = performance.now()
      for (let i = 0; i < 90; i++) {
        await new Promise(r => requestAnimationFrame(r))
        for (const p of document.querySelectorAll<HTMLElement>('[data-risk-return] [data-point]'))
          if (!full.has(p.dataset['point']!) && Number(getComputedStyle(p).opacity) >= 0.99) full.set(p.dataset['point']!, performance.now() - t0)
      }
      const ledger = [...document.querySelectorAll<HTMLElement>('tbody tr')]
        .filter(tr => tr.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked)
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map(tr => tr.querySelector('th a')?.getAttribute('href')?.split('/').pop() ?? '')
      return ledger.map(id => full.get(id) ?? -1)
    })
    expect(order.length).toBeGreaterThan(1)
    for (const t of order) expect(t).toBeGreaterThan(0)
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!)
    await allArrived(page, 'arrival')

    // A row charted while the view is open.
    await page.locator('tbody input[type=checkbox]:not(:checked)').first().click()
    await settle(page)
    await allArrived(page, 'charted while open')

    // A row unticked and ticked again two frames later.
    const box = page.locator('tbody input[type=checkbox]:checked').nth(1)
    await box.evaluate(async el => {
      ;(el as HTMLInputElement).click()
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      ;(el as HTMLInputElement).click()
    })
    await settle(page)
    await allArrived(page, 'unticked and ticked again')

    // Away and straight back, mid-exit; and from Heat.
    await page.evaluate(async () => {
      const pick = (n: string) => [...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => new RegExp(n, 'i').test(b.textContent ?? '')) as HTMLButtonElement
      for (const v of ['trend', 'risk', 'trend', 'risk']) {
        pick(v).click()
        for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r))
      }
    })
    await settle(page)
    await allArrived(page, 'away and back mid-exit')
    await view(page, 'Heat').click()
    await settle(page, 600)
    await page.evaluate(() => ([...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => /risk/i.test(b.textContent ?? '')) as HTMLButtonElement).click())
    await settle(page)
    await allArrived(page, 'from Heat')

    // Landing on the view.
    await page.goto('/?view=risk')
    await settle(page)
    await allArrived(page, 'landing on the view')
  })
})
