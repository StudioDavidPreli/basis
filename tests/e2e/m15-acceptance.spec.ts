import { test, expect, type Page } from '@playwright/test'
import { axe } from './land'
import { takeDraws, watchDraws } from './draw-frames'

// M15's acceptance check, the parts no step's own spec covered (plan.md,
// M15): the draw by rank with the chart full, the margin's count starting
// again on a refresh, and axe on M15's surfaces in every stock ×
// reduced-motion combination. The rest lives with its step: the lint
// (eslint/no-inline-motion.test.ts), the draw (chart.spec, projection.spec,
// tests/dev), the pour (heat.spec), the ledger's wait (table.spec), the date
// fields (diagnostics.spec), the margin (margin.spec), the flash
// (refresh.spec). The title's minute scramble was withdrawn
// (decisions/2026-10-22-the-margin-title-is-static-for-now.md).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

async function hydrated(page: Page) {
  await page.getByRole('button', { name: 'Command palette' }).evaluate(e => new Promise<void>(done => {
    const check = () => (Object.keys(e).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
    check()
  }))
}

test.describe('M15 acceptance', () => {
  test('with the chart full, a metric switch draws every line by rank on Cinematic', async ({ page }) => {
    // The chart draws eight rows at most; the ninth waits (chart.spec), so
    // full is eight, not the twelve the plan's line named.
    await watchDraws(page)
    await page.goto('/')
    await hydrated(page)
    const unticked = page.locator('tbody input[type=checkbox]:not(:checked)')
    while ((await page.locator('path[data-series]').count()) < 8) await unticked.first().click()
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(8, { timeout: 5000 })
    await takeDraws(page)
    await page.getByRole('group', { name: 'Metric' }).getByRole('button', { name: 'Δ 1d' }).click()
    await page.waitForTimeout(3200)
    const { ledger, draws } = await takeDraws(page)
    expect(draws).toHaveLength(8)
    const charted = ledger.filter(id => draws.some(d => d.id === id))
    const lands = charted.map(id => draws.find(d => d.id === id)!.land)
    for (let i = 1; i < lands.length; i++) expect(lands[i]!, charted[i]).toBeGreaterThan(lands[i - 1]!)
    // slower + slow on Cinematic, 2300 ms, less the first line's first frames.
    expect(lands[lands.length - 1]!).toBeGreaterThan(2000)
    expect(lands[lands.length - 1]!).toBeLessThan(2500)
  })

  test('the margin\'s count starts again when a refresh lands', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    const age = page.locator('[data-age]')
    await expect(age).toHaveText(/^\+00:(0[5-9]|[1-5]\d)$/, { timeout: 12_000 })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(age).toHaveText(/^\+00:0[0-3]$/, { timeout: 10_000 })
  })

  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`axe is clean on M15's surfaces: ${theme}, reduced motion ${reduce ? 'on' : 'off'}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme === 'operate' ? 'dark' : 'light', reducedMotion: reduce ? 'reduce' : 'no-preference' })
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(page.locator('[data-age]')).not.toHaveText('')
        expect((await (await axe(page)).analyze()).violations, 'the sheet, drawn').toEqual([])
        await page.goto('/?view=heat')
        await expect(page.locator('[data-heat]')).not.toHaveAttribute('data-pour', { timeout: 4000 })
        expect((await (await axe(page)).analyze()).violations, 'Heat, poured').toEqual([])
      })
    }
  }
})
