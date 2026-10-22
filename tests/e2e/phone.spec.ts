import { test, expect } from '@playwright/test'
import { axe } from './land'

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
      const label = { time: 'Trend', risk: 'Risk / return', heat: 'Heat' }[view]
      await expect(page.getByRole('group', { name: 'Chart view' }).getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      const results = await (await axe(page)).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('[ Clear ] sits beside Inputs, and the legend has no second one', async ({ page }) => {
    await page.goto('/')
    const chip = page.getByRole('button', { name: /^Inputs/ })
    const clears = page.getByRole('button', { name: '[ Clear ]' })
    await expect(clears).toHaveCount(1)
    const c = await box(chip)
    const k = await box(clears)
    expect(Math.abs(c.mid - k.mid)).toBeLessThanOrEqual(3)
    expect(k.left - c.right).toBeLessThanOrEqual(24)
    await clears.click()
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('button', { name: /^Remove / })).toHaveCount(0)
  })

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
    await expect(sheet).toBeVisible()
    await page.waitForTimeout(800)
    // The sheet lowers as the drawer opens, above it, not cut away.
    const lowering = await page.evaluate(async () => {
      ;(document.querySelector('[data-inputs-sheet] a[data-entity-link="ou-tokyo"]') as HTMLAnchorElement).click()
      const out: { top: number; onTop: boolean }[] = []
      for (let i = 0; i < 40; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const d = document.querySelector('[data-inputs-sheet]')
        if (!d) break
        const r = d.getBoundingClientRect()
        const el = r.top < window.innerHeight - 30 ? document.elementFromPoint(window.innerWidth / 2, r.top + 20) : null
        out.push({ top: Math.round(r.top), onTop: el === null || el.closest('[data-inputs-sheet]') !== null })
      }
      return out
    })
    expect(lowering.length).toBeGreaterThan(5)
    expect(lowering[lowering.length - 1]!.top).toBeGreaterThan(lowering[0]!.top + 200)
    for (let i = 1; i < lowering.length; i++) expect(lowering[i]!.top).toBeGreaterThanOrEqual(lowering[i - 1]!.top - 1)
    expect(lowering.every(f => f.onTop)).toBe(true)
    const drawer = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(drawer).toBeVisible()
    await expect(sheet).toHaveCount(0)
    await expect(drawer.locator('[data-drawer-heading]')).toBeFocused()
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
        const results = await (await axe(page)).analyze()
        expect(results.violations).toEqual([])
      })
    }
  }
})

test.describe('the window on a phone, 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the calendar opens the window dialog; two dates set the window into the URL, Reset clears it, Done returns focus', async ({ page }) => {
    await page.goto('/')
    const strip = page.getByRole('region', { name: 'Diagnostics' })
    // The inline inputs are the tablet's and the desktop's; here, a caption.
    await expect(strip.getByLabel('Window from')).toBeHidden()
    const caption = page.locator('[data-window-caption]')
    await expect(caption).toContainText('follows the view')
    const calendar = strip.getByRole('button', { name: /^Analysis window, / })
    await calendar.click()
    const dialog = page.getByRole('dialog', { name: 'Analysis window' })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(d => d.matches(':modal'))).toBe(true)
    await dialog.getByLabel('From').fill('2026-07-01')
    await dialog.getByLabel('To').fill('2026-08-31')
    await expect(page).toHaveURL(/from=2026-07-01/)
    await expect(page).toHaveURL(/to=2026-08-31/)
    await expect(caption).toContainText('Jul 1 – Aug 31')
    await expect(caption).toContainText('set by hand')
    await expect(calendar).toHaveAttribute('data-set', '')
    await dialog.getByRole('button', { name: /Reset to the view/ }).click()
    await expect(page).not.toHaveURL(/from=/)
    await expect(caption).toContainText('follows the view')
    await dialog.getByRole('button', { name: /Done/ }).click()
    await expect(dialog).toHaveCount(0)
    await expect(calendar).toBeFocused()
  })

  test('Export sits beside the calendar', async ({ page }) => {
    await page.goto('/')
    const strip = page.getByRole('region', { name: 'Diagnostics' })
    const c = await box(strip.getByRole('button', { name: /^Analysis window, / }))
    const e = await box(strip.getByRole('button', { name: /^Export the chart as CSV/ }))
    expect(Math.abs(c.mid - e.mid)).toBeLessThanOrEqual(1)
    expect(e.left - c.right).toBeLessThanOrEqual(16)
  })

  test.describe('drags on the plot', () => {
    test.use({ hasTouch: true })
    test('a finger dragged across the plot sets no window; a mouse dragged the same way does', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('path[data-series][data-drawn]').first()).toBeVisible()
      const box = (await page.locator('[role="img"] [class*="__box"]').first().boundingBox())!
      const y = box.y + box.height / 2
      const xs = [0.2, 0.4, 0.6, 0.8].map(f => box.x + box.width * f)
      // Real touch input. Chromium claims a touch drag for the page under the
      // default touch-action and cancels the pointer, so this holds with or
      // without the chart's own touch guard; the guard states the intent.
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: xs[0]!, y }] })
      for (const x of xs.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(300)
      await expect(page).not.toHaveURL(/from=/)
      await expect(page.locator('[data-window-caption]')).toContainText('follows the view')
      // The control: the same stroke from a mouse sets the window.
      await page.mouse.move(xs[0]!, y)
      await page.mouse.down()
      for (const x of xs.slice(1)) await page.mouse.move(x, y, { steps: 3 })
      await page.mouse.up()
      await expect(page).toHaveURL(/from=/)
    })
  })

  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`axe is clean with the window dialog open: ${theme}, reduced motion ${reduce ? 'on' : 'off'}`, async ({ page }) => {
        await page.goto(`/?theme=${theme}${reduce ? '&reduce=1' : ''}`)
        await page.getByRole('button', { name: /^Analysis window, / }).click()
        await expect(page.getByRole('dialog', { name: 'Analysis window' })).toBeVisible()
        await page.waitForTimeout(600)
        const results = await (await axe(page)).analyze()
        expect(results.violations).toEqual([])
      })
    }
  }
})

test.describe('the views read on a phone, 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Heat names each row by its first word and labels every third week; the full name stays for a screen reader', async ({ page }) => {
    await page.goto('/?view=heat')
    const first = page.locator('[data-heat] tbody th[scope="row"]').first()
    await expect(first).toHaveAccessibleName(/^Anchor Kaze/)
    // What shows is the one word; the full name is clipped to a pixel.
    const seen = await first.evaluate(th =>
      [...th.querySelectorAll('span')]
        .filter(s => getComputedStyle(s).display !== 'none' && s.getBoundingClientRect().width > 1 && s.children.length === 0)
        .map(s => s.textContent!.trim())
        .filter(Boolean),
    )
    expect(seen).toEqual(['Anchor'])
    // Thirteen weeks at 3M: labels on weeks 1, 4, 7, 10, and 13, none touching.
    const shown = await page.locator('[data-heat] thead th').evaluateAll(ths =>
      ths
        .map(th => th.querySelector('[aria-hidden="true"]') as HTMLElement | null)
        .filter((l): l is HTMLElement => l !== null && getComputedStyle(l).visibility === 'visible' && l.textContent!.trim() !== '')
        .map(l => l.getBoundingClientRect()),
    )
    expect(shown).toHaveLength(5)
    for (let i = 1; i < shown.length; i++) expect(shown[i]!.left).toBeGreaterThan(shown[i - 1]!.right)
  })

  // Every view draws the selection (decisions/2026-10-20-the-views-draw-
  // the-selection.md): Risk / return's points are the charted rows, each named
  // where its label fits.
  test('Risk / return draws and names the charted rows', async ({ page }) => {
    await page.goto('/?view=risk')
    await expect(page.locator('[data-point]')).toHaveCount(4)
    const named = await page.locator('[data-point]').evaluateAll(ps =>
      ps.filter(p => {
        const l = p.querySelector('[data-side]')
        return l !== null && getComputedStyle(l).display !== 'none'
      }).length,
    )
    expect(named).toBeGreaterThanOrEqual(3)
  })
})

test.describe('the welcome reads as the device does', () => {
  // The welcome's own storage: nothing dismissed.
  test.use({ storageState: { cookies: [], origins: [] } })
  for (const [width, lines] of [
    [390, ['Tap Inputs to choose what is charted.', 'In Inputs, tap a name', 'Tap any figure', 'tap the calendar to set its window']],
    [1280, ['Tick a row to chart it.', 'Click a name', 'Hover any figure', 'drag across the plot to set its window']],
  ] as const) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      const dialog = page.getByRole('dialog', { name: /Basis/ })
      await expect(dialog).toBeVisible()
      const text = await dialog.locator('ol').evaluate(ol => (ol as HTMLElement).innerText)
      for (const line of lines) expect(text).toContain(line)
      expect(text.split('\n').filter(Boolean).length).toBeLessThanOrEqual(8)
    })
  }
})

test.describe('the header on a 375px phone', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  test('the dataset tabs and the three buttons stay on one row', async ({ page }) => {
    await page.goto('/')
    const mids = await page.locator('header button').evaluateAll(bs => bs.map(b => {
      const r = b.getBoundingClientRect()
      return r.top + r.height / 2
    }))
    expect(mids.length).toBeGreaterThanOrEqual(5)
    for (const m of mids) expect(Math.abs(m - mids[0]!)).toBeLessThanOrEqual(3)
  })
})

test.describe('a tablet has no Inputs chip', () => {
  test.use({ viewport: { width: 820, height: 1180 } })
  test('the ledger is on the page and the chip is not shown', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('table').last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Inputs/ })).toBeHidden()
  })
})
