import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M13's phone tier (decisions/2026-10-20-two-breakpoints-640-and-900.md,
// decisions/2026-10-20-the-ledger-is-a-sheet-on-a-phone.md): under 640px
// every view, metric, and range is on screen, without ⌘K.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

type Box = { top: number; bottom: number; left: number; right: number; mid: number; width: number }
const box = (l: import('@playwright/test').Locator): Promise<Box> =>
  l.evaluate(e => {
    const r = e.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: r.top + r.height / 2, width: r.width }
  })

test.describe('a phone, 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the controls are three rows: the views across, the metrics, then projection and the range', async ({ page }) => {
    await page.goto('/')
    const views = page.getByRole('group', { name: 'Chart view' })
    const metric = page.getByRole('group', { name: 'Metric' })
    const range = page.getByRole('group', { name: 'Time range' })
    const projection = page.getByRole('checkbox', { name: /Projection/ })
    for (const l of [views, metric, range, projection]) await expect(l).toBeVisible()

    // The view switch spans the content: three equal segments on one row.
    const segments = await Promise.all((await views.getByRole('button').all()).map(box))
    expect(segments).toHaveLength(3)
    for (const s of segments) {
      expect(Math.abs(s.mid - segments[0]!.mid)).toBeLessThanOrEqual(1)
      expect(Math.abs(s.width - segments[0]!.width)).toBeLessThanOrEqual(1)
    }
    const v = await box(views)
    const r = await box(range)
    expect(Math.abs(v.right - r.right)).toBeLessThanOrEqual(1)

    // Then the metrics, then projection and range together.
    const m = await box(metric)
    const p = await box(projection)
    expect(m.top).toBeGreaterThanOrEqual(v.bottom)
    expect(p.mid).toBeGreaterThan(m.bottom)
    expect(Math.abs(r.mid - p.mid)).toBeLessThanOrEqual(2)
  })

  for (const view of ['time', 'risk', 'heat'] as const) {
    test(`?view=${view}: the switch shows the view pressed, nothing scrolls sideways, axe is clean`, async ({ page }) => {
      await page.goto(`/?view=${view}`)
      const label = { time: 'Over time', risk: 'Risk / return', heat: 'Heat' }[view]
      await expect(page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('a tap on a view switches it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: 'Heat' }).click()
    await expect(page).toHaveURL(/view=heat/)
    await expect(page.locator('[data-heat]')).toBeVisible()
  })

  test('Inputs opens the ledger as a modal sheet; a tick charts the row behind it; Escape lowers it and focus returns to the chip', async ({ page }) => {
    await page.goto('/')
    // No ledger on the page: it is the sheet.
    await expect(page.locator('table')).toHaveCount(0)
    const chip = page.getByRole('button', { name: /^Inputs/ })
    await expect(chip).toHaveAttribute('aria-label', 'Inputs, 4 of 12 selected')
    await chip.click()
    const sheet = page.getByRole('dialog', { name: 'Inputs' })
    await expect(sheet).toBeVisible()
    expect(await sheet.evaluate(d => d.matches(':modal'))).toBe(true)
    await expect(sheet.locator('tbody tr')).toHaveCount(12)
    // As tall as its content, up to 80% of the viewport.
    const { h, vh } = await sheet.evaluate(d => ({ h: d.getBoundingClientRect().height, vh: window.innerHeight }))
    expect(h).toBeLessThanOrEqual(vh * 0.8 + 1)

    await sheet.getByRole('checkbox', { name: /Keel London/ }).check()
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('button', { name: /Keel London/ })).toHaveCount(1)
    await expect(chip).toHaveAttribute('aria-label', 'Inputs, 5 of 12 selected')

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(chip).toBeFocused()
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  test('a name in the sheet opens the drawer; closing the drawer lifts the sheet again with focus on the name', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /^Inputs/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Inputs' })
    await sheet.getByRole('link', { name: /Anchor Kaze/ }).click()
    const drawer = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(drawer).toBeVisible()
    await expect(sheet).toHaveCount(0)
    await drawer.getByRole('button', { name: /^Close Anchor Kaze/ }).click()
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('link', { name: /Anchor Kaze/ })).toBeFocused()
  })

  test('the sheet lifts from below the edge; under reduced motion it is in place at once', async ({ page }) => {
    for (const reduce of [false, true]) {
      await page.goto(reduce ? '/?reduce=1' : '/')
      const tops = await page.evaluate(async () => {
        ;(document.querySelector('[data-inputs-chip]') as HTMLButtonElement).click()
        const out: number[] = []
        for (let i = 0; i < 30; i++) {
          await new Promise(r => requestAnimationFrame(r))
          const d = document.querySelector('[data-inputs-sheet]')
          if (d) out.push(Math.round(d.getBoundingClientRect().top))
        }
        return out
      })
      const last = tops[tops.length - 1]!
      if (reduce) {
        expect(tops.slice(1).every(t => Math.abs(t - last) <= 1)).toBe(true)
      } else {
        // Rising: it starts low, never jumps back down, and lands.
        expect(tops[0]!).toBeGreaterThan(last + 100)
        for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeLessThanOrEqual(tops[i - 1]! + 1)
      }
    }
  })

  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`axe is clean with the sheet open: ${theme}, reduced motion ${reduce ? 'on' : 'off'}`, async ({ page }) => {
        await page.goto(`/?theme=${theme}${reduce ? '&reduce=1' : ''}`)
        await page.getByRole('button', { name: /^Inputs/ }).click()
        await expect(page.getByRole('dialog', { name: 'Inputs' })).toBeVisible()
        await page.waitForTimeout(800)
        const results = await new AxeBuilder({ page }).analyze()
        expect(results.violations).toEqual([])
      })
    }
  }
})

test.describe('a tablet has no Inputs chip', () => {
  test.use({ viewport: { width: 820, height: 1180 } })
  test('the ledger is on the page and the chip is not shown', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table').last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Inputs/ })).toBeHidden()
  })
})
