import { test, expect } from '@playwright/test'
import { axe } from './land'

// M12 step 3 on the Worker runtime, fixtures mode: the hero's Heat view
// (decisions/2026-10-19-heat-measures-moves-in-sigma.md,
// decisions/2026-10-19-heat-diverges-blue-to-rust.md).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const heads = (page: import('@playwright/test').Page) => page.locator('[data-heat] thead th')

test.describe('the Heat view', () => {
  test('shows the charted rows in buckets the range sets, from the switch and in the URL', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: 'Heat' }).click()
    await expect(page).toHaveURL('/?view=heat')
    await expect(page.locator('[data-heat] tbody tr')).toHaveCount(4)
    await expect(heads(page)).toHaveCount(14) // the corner and thirteen weeks
    await expect(page.locator('[data-heat-caption]')).toContainText('week')
    await expect(page.locator('[data-strip-note]')).toHaveCount(0)
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    // The week grid crossfades out as the day grid comes in; then one.
    await expect(page.locator('[data-heat]')).toHaveCount(1)
    await expect(page.locator('[data-heat]')).toHaveAttribute('data-unit', 'day')
    // A day each across the month, give or take the month's length.
    expect(await heads(page).count()).toBeGreaterThanOrEqual(29)
  })

  test('every outlier carries its dot, and no other cell does', async ({ page }) => {
    await page.goto('/?view=heat')
    await expect(page.locator('[data-cell]')).toHaveCount(52)
    const mismatch = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-cell]')].filter(b => {
        const z = b.dataset.z === undefined ? 0 : Math.abs(Number(b.dataset.z))
        return (z >= 2) !== (b.querySelector('span') !== null)
      }).length,
    )
    expect(mismatch).toBe(0)
  })

  test('rows are the charted ones, in the ledger\'s sort; ticking a row adds it', async ({ page }) => {
    await page.goto('/?view=heat&sort=name&dir=desc')
    await expect(page.locator('[data-heat] tbody tr')).toHaveCount(4)
    const heat = await page.locator('[data-heat] tbody tr').evaluateAll(trs => trs.map(t => t.getAttribute('data-row')))
    const ledger = await page.locator('tbody tr:has(input[type="checkbox"]:checked) [data-entity-link]').evaluateAll(as => as.map(a => a.getAttribute('data-entity-link')))
    expect(heat).toEqual(ledger)
    await page.locator('[data-entity-link="ou-london"]').locator('xpath=ancestor::tr[1]').getByRole('checkbox').check()
    await expect(page.locator('[data-heat] tbody tr')).toHaveCount(5)
    await page.getByRole('checkbox', { name: 'Deselect all rows' }).click()
    await expect(page.locator('[data-heat-empty]')).toContainText('Select rows')
  })

  test('the keyboard walks the grid, reads the cell, and a pick opens Trend on that row and week', async ({ page }) => {
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

  // The grid pours in (decisions/2026-10-21-heat-cells-pour-in.md): held at
  // the paper from the first frame it is in the DOM, so no engine paints
  // it whole first (a clip did, in Safari; David, 2026-10-19); then each
  // row on its rank and each week oldest to newest; then the pour is over.
  test('the grid pours in by rank and week, held at the paper from its first frame', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const r = await page.evaluate(async () => {
      const state = (c: Element) => {
        const a = c.getAnimations().find(x => (x as CSSAnimation).animationName?.includes('pour'))
        if (!a) return 'none'
        return (a.currentTime as number) < (a.effect!.getTiming().delay ?? 0) ? 'held' : 'started'
      }
      const seen: { atInsert: { held: number; total: number } | null } = { atInsert: null }
      const mo = new MutationObserver(() => {
        const cells = [...document.querySelectorAll('[data-heat] [data-cell]')]
        if (seen.atInsert === null && cells.length) seen.atInsert = { held: cells.filter(c => state(c) === 'held').length, total: cells.length }
      })
      mo.observe(document.body, { childList: true, subtree: true })
      ;([...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => b.textContent === 'Heat') as HTMLButtonElement).click()
      const started: Record<string, number> = {}
      const t0 = performance.now()
      for (let i = 0; i < 150; i++) {
        await new Promise(r => requestAnimationFrame(r))
        for (const c of document.querySelectorAll<HTMLElement>('[data-heat] [data-cell]'))
          if (!(c.dataset['cell']! in started) && state(c) !== 'held') started[c.dataset['cell']!] = performance.now() - t0
      }
      mo.disconnect()
      const ids = Object.keys(started)
      const rows = [...new Set(ids.map(k => k.split(':')[0]!))]
      const cols = ids.filter(k => k.startsWith(`${rows[0]}:`)).length
      return {
        atInsert: seen.atInsert,
        rowStarts: rows.map(row => started[`${row}:0`]!),
        colStarts: Array.from({ length: cols }, (_, c) => started[`${rows[0]}:${c}`]!),
        pourOver: !document.querySelector('[data-heat]')!.hasAttribute('data-pour'),
      }
    })
    // At insertion every cell but the first's is held at the paper.
    expect(r.atInsert!.held).toBeGreaterThanOrEqual(r.atInsert!.total - 1)
    for (let i = 1; i < r.rowStarts.length; i++) expect(r.rowStarts[i]!).toBeGreaterThan(r.rowStarts[i - 1]!)
    for (let i = 1; i < r.colStarts.length; i++) expect(r.colStarts[i]!).toBeGreaterThanOrEqual(r.colStarts[i - 1]!)
    expect(r.colStarts[r.colStarts.length - 1]!).toBeGreaterThan(r.colStarts[0]! + 300)
    expect(r.pourOver).toBe(true)
  })

  // A switch never moves the sheet below the hero, and the heat rows land
  // where they stay: with popLayout WebKit laid both views out for a frame,
  // and inside the hero's layout group the rows slid in from wrong places
  // (David saw the map static, then animating on again; 2026-10-19).
  test('a view switch moves nothing below the hero, and the heat rows land still', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    for (const to of ['Risk / return', 'Heat', 'Trend', 'Heat']) {
      const r = await page.evaluate(async to => {
        const legend = () => Math.round(document.querySelector('[aria-label="Selected rows"]')!.getBoundingClientRect().top)
        const rows = () => [...document.querySelectorAll('[data-heat] tbody tr')].map(t => Math.round(t.getBoundingClientRect().top)).join(',')
        const before = legend()
        const tops = new Set<number>()
        const layouts = new Set<string>()
        ;([...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => b.textContent === to) as HTMLButtonElement).click()
        for (let i = 0; i < 40; i++) {
          await new Promise(r => requestAnimationFrame(r))
          tops.add(legend())
          const x = rows()
          if (x) layouts.add(x)
        }
        return { before, tops: [...tops], layouts: layouts.size }
      }, to)
      expect(r.tops, to).toEqual([r.before])
      expect(r.layouts, to).toBeLessThanOrEqual(1)
      await page.waitForTimeout(400)
    }
  })

  test('passes axe in Heat, on both stocks', async ({ page }) => {
    for (const theme of ['passbook', 'operate']) {
      await page.goto(`/?view=heat&theme=${theme}`)
      await expect(page.locator('[data-cell]')).toHaveCount(52)
      const results = await (await axe(page)).analyze()
      expect(results.violations, theme).toEqual([])
    }
  })
})
