import { test, expect, type Page } from '@playwright/test'
import { axe, landEmpty } from './land'

// M5 acceptance on the Worker runtime, fixtures mode: a deep link renders
// the same state server-side with no hydration error; the back button
// closes the drawer; focus returns to the originating row. Plus what the
// spec adds: the sheet stays live behind the non-modal drawer, another
// name click switches the entity, a hard load renders a full page.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', m => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

test.describe('URL state', () => {
  test('a deep link renders its state on the server and hydrates without error', async ({ page, request }) => {
    const url = '/?dataset=regions&sort=change&dir=desc&range=5Y'
    // The HTML itself carries the state: no client render decided it.
    const html = await (await request.get(url)).text()
    expect(html).toContain('aria-sort="descending"')
    expect(html).toContain('Brooklyn')
    expect(html).not.toContain('Anchor Kaze')

    const errors = collectErrors(page)
    await page.goto(url)
    await expect(page.locator('tbody tr')).toHaveCount(8)
    await expect(page.getByRole('columnheader', { name: /Δ 1d/ })).toHaveAttribute('aria-sort', 'descending')
    await expect(page.getByRole('button', { name: 'Regions' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '5Y' })).toHaveAttribute('aria-pressed', 'true')
    // Sorted descending by change: the first row is not the file's first.
    await expect(page).toHaveURL(url)
    expect(errors).toEqual([])
  })

  test('the sheet mirrors sort, dataset, metric, and range to the URL with defaults omitted', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await expect(page).toHaveURL('/?sort=level')
    await page.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await expect(page).toHaveURL('/?sort=level&dir=desc')
    await page.getByRole('group', { name: 'Metric' }).getByRole('button', { name: 'Δ 1d' }).click()
    await expect(page).toHaveURL('/?sort=level&dir=desc&metric=change')
    // A new dataset drops the sort, and its own default metric is bare.
    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page).toHaveURL('/?dataset=regions')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: 'Max' }).click()
    await expect(page).toHaveURL('/?dataset=regions&range=Max')
    await page.getByRole('button', { name: 'Comparables' }).click()
    await expect(page).toHaveURL('/?range=Max')
    // Nothing above added history: one back leaves the sheet.
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2)
  })
})

test.describe('the drawer', () => {
  test('opens from the name link, focuses the heading, and Escape returns focus to the link', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const link = page.getByRole('link', { name: /Anchor Kaze/ })
    await link.click()
    const dialog = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL('/company/ou-tokyo')
    await expect(dialog.getByRole('heading', { level: 2, name: /Anchor Kaze/ })).toBeFocused()
    await expect(dialog).toContainText('Anchor Kaze is a reinsurance company')
    await expect(dialog).toContainText('mean-reverting series')
    await expect(dialog.getByRole('heading', { name: 'Figures' })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Inputs' })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Recent changes' })).toBeVisible()
    await expect(dialog.getByRole('link', { name: /open the request/ }).first()).toHaveAttribute('href', /open-meteo/)
    // Non-modal: no backdrop, the element is in flow beside the sheet.
    expect(await dialog.evaluate(el => (el as HTMLDialogElement).open && !el.matches(':modal'))).toBe(true)
    await page.keyboard.press('Escape')
    // History moves at once; the drawer stays for its exit, then goes.
    await expect(page).toHaveURL('/')
    expect(await page.locator('dialog').count()).toBe(1)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(link).toBeFocused()
    expect(errors).toEqual([])
  })

  test('the back button closes it and returns focus to the row', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: /Anchor Kaze/ })
    await link.click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/')
    await expect(link).toBeFocused()
  })

  test('Enter on the link opens it, and the close control closes it', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: /Anchor Kaze/ })
    await link.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close Anchor Kaze' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/')
    await expect(link).toBeFocused()
  })

  test('the sheet stays live behind it: rows select and sort, and the URL mirrors once back returns', async ({ page }) => {
    await landEmpty(page, '/')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await expect(page.getByRole('checkbox', { name: 'Chart Anchor Kaze' })).toBeChecked()
    await expect(page.getByRole('list', { name: 'Selected rows' })).toContainText('Anchor Kaze')
    await page.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await expect(page.getByRole('columnheader', { name: /Level/ })).toHaveAttribute('aria-sort', 'ascending')
    // The drawer's URL is left alone while it is open.
    await expect(page).toHaveURL('/company/ou-tokyo')
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/?sort=level')
    await expect(page.getByRole('checkbox', { name: 'Chart Anchor Kaze' })).toBeChecked()
  })

  test('another name click switches the entity in place, and back closes the drawer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Anchor Kaze/ })).toHaveAttribute('aria-current', 'page')
    const second = page.locator('tbody tr').nth(1).getByRole('link')
    const secondName = (await second.textContent())!.trim()
    const before = await page.locator('dialog').elementHandle()
    await second.click()
    // The text scrambles into the new entity's: noise glyphs appear beside
    // the hidden real text for a moment.
    await page.waitForFunction(() => !!document.querySelector('dialog h2 span[aria-hidden]'))
    // One dialog, the same element, re-targeted: no reopen.
    await expect(page.locator('dialog')).toHaveCount(1)
    expect(await page.locator('dialog').evaluate((el, prev) => el === prev, before)).toBe(true)
    await expect(page.getByRole('dialog', { name: secondName })).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toBeFocused()
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(new RegExp(secondName))
    await expect(page).not.toHaveURL('/company/ou-tokyo')
    // The switch replaced history, so one back closes the drawer outright.
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL('/')
    await expect(second).toBeFocused()
  })

  test('clicking the open entity\'s name again closes the drawer; another name switches it', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: /Anchor Kaze/ })
    await link.click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    // Another name switches the drawer in place.
    await page.getByRole('link', { name: /Keel London/ }).click()
    await expect(page.getByRole('dialog', { name: /Keel London/ })).toBeVisible()
    await expect(page.locator('dialog')).toHaveCount(1)
    // The open entity's own name closes it, and focus returns to that name.
    const keel = page.getByRole('link', { name: /Keel London/ })
    await keel.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/localhost:\d+\/(\?|$)/)
    await expect(keel).toBeFocused()
    await expect(page.locator('tbody tr')).toHaveCount(12)
    // And it opens again from the same name.
    await keel.click()
    await expect(page.getByRole('dialog', { name: /Keel London/ })).toBeVisible()
  })

  test('a provenance dialog inside the drawer takes Escape first', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    const drawer = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await drawer.getByRole('button', { name: /^Level for/ }).click()
    const provenance = page.getByRole('dialog', { name: 'Provenance' })
    await expect(provenance).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(provenance).toHaveCount(0)
    await expect(drawer).toBeVisible()
    // And from its own close control, top right.
    await drawer.getByRole('button', { name: /^Level for/ }).click()
    await expect(provenance).toBeVisible()
    await provenance.getByRole('button', { name: 'Close provenance' }).click()
    await expect(provenance).toHaveCount(0)
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('on a wide viewport the drawer takes the gutter and the sheet does not move', async ({ page }) => {
    await page.setViewportSize({ width: 2600, height: 900 })
    await page.goto('/')
    const table = page.locator('table')
    const chart = page.getByRole('region', { name: 'Chart' })
    const before = { table: await table.boundingBox(), chart: await chart.boundingBox() }
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.waitForTimeout(900) // the spring settles
    expect({ table: await table.boundingBox(), chart: await chart.boundingBox() }).toEqual(before)
    const dialog = (await page.locator('dialog').boundingBox())!
    expect(Math.round(dialog.x + dialog.width)).toBe(2600)
    expect(dialog.x).toBeGreaterThanOrEqual(before.table!.x + before.table!.width)
  })

  test('on a narrower viewport the sheet narrows beside the drawer with its left edge in place', async ({ page }) => {
    await page.goto('/')
    const table = page.locator('table')
    const before = (await table.boundingBox())!
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.waitForTimeout(900)
    const after = (await table.boundingBox())!
    expect(Math.round(after.x)).toBe(Math.round(before.x))
    expect(after.width).toBeLessThan(before.width)
  })

  test('a region opens the same way and passes axe with the drawer open', async ({ page }) => {
    await page.goto('/?dataset=regions')
    await page.getByRole('link', { name: /Brooklyn/ }).click()
    const dialog = page.getByRole('dialog', { name: /Brooklyn/ })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL('/region/brooklyn')
    await expect(dialog).toContainText('Brooklyn is a region series')
    await expect(dialog).toContainText('Region · Regions')
    await page.screenshot({ path: 'test-results/drawer-region.png' })
    const results = await (await axe(page)).analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('the full page', () => {
  test('a hard load of a company renders a page, not a dialog, and passes axe', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/company/ou-tokyo')
    await expect(page.getByRole('heading', { level: 1, name: /Anchor Kaze/ })).toBeVisible()
    await expect(page.locator('dialog')).toHaveCount(0)
    await expect(page.locator('tbody tr')).toHaveCount(0)
    await expect(page.getByText('Anchor Kaze is a reinsurance company')).toBeVisible()
    await expect(page.getByRole('link', { name: /Basis/ })).toHaveAttribute('href', '/')
    await expect(page).toHaveTitle(/Anchor Kaze/)
    await page.screenshot({ path: 'test-results/company-page.png' })
    const results = await (await axe(page)).analyze()
    expect(results.violations).toEqual([])
    expect(errors).toEqual([])
  })

  test('a hard load of a region renders its page', async ({ page }) => {
    await page.goto('/region/brooklyn')
    await expect(page.getByRole('heading', { level: 1, name: /Brooklyn/ })).toBeVisible()
    await expect(page.getByText('Brooklyn is a region series')).toBeVisible()
  })

  test('an unknown id, or the wrong kind, is a 404', async ({ request }) => {
    expect((await request.get('/company/nope')).status()).toBe(404)
    expect((await request.get('/region/ou-tokyo')).status()).toBe(404)
    expect((await request.get('/company/brooklyn')).status()).toBe(404)
  })
})

// The drawer's scrollbar is hidden and a bouncing ↓ stands in for it
// (decisions/2026-10-15-drawer-scroll-cue.md; contract, "Drawer scroll cue").
test.describe('the drawer scroll cue', () => {
  async function openDrawer(page: Page) {
    await page.goto('/')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    const dialog = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(dialog).toBeVisible()
    // The open spring has settled when the inline width is cleared.
    await expect.poll(() => dialog.evaluate(el => (el as HTMLElement).style.width)).toBe('')
    return dialog
  }

  test('shows while there is more below, clears at the bottom, and returns on the way up', async ({ page }) => {
    const dialog = await openDrawer(page)
    const cue = dialog.locator('[data-drawer-scroll-cue]')
    await expect(cue).toHaveAttribute('aria-hidden', 'true')
    await expect(cue).toHaveAttribute('data-more', 'true')
    // No bar takes width: the scrollport is the box less its left hairline.
    const gutter = await dialog.evaluate(el => {
      const border = parseFloat(getComputedStyle(el).borderLeftWidth)
      return el.getBoundingClientRect().width - border - el.clientWidth
    })
    expect(gutter).toBeLessThan(1)
    // The cue adds nothing to the scroll length.
    expect(await cue.evaluate(el => el.getBoundingClientRect().height)).toBe(0)
    await expect(cue.locator('span').first()).toHaveCSS('opacity', '1')

    await dialog.evaluate(el => el.scrollTo({ top: el.scrollHeight }))
    await expect(cue).not.toHaveAttribute('data-more')
    await expect(cue.locator('span').first()).toHaveCSS('opacity', '0')
    await expect(cue.locator('span').first()).toHaveCSS('pointer-events', 'none')

    await dialog.evaluate(el => el.scrollTo({ top: 0 }))
    await expect(cue).toHaveAttribute('data-more', 'true')
  })

  test('the keys scroll the drawer with the bar hidden', async ({ page }) => {
    const dialog = await openDrawer(page)
    await page.keyboard.press('PageDown')
    await expect.poll(() => dialog.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  })

  test('bounces, stills under a hovering pointer, and holds still under reduced motion', async ({ page }) => {
    const dialog = await openDrawer(page)
    const pad = dialog.locator('[data-drawer-scroll-cue] > span')
    const arrow = pad.locator('span')
    // CSS Modules scopes the keyframes' name.
    await expect(arrow).toHaveCSS('animation-name', /scroll-cue-bounce$/)
    await expect(arrow).toHaveCSS('animation-play-state', 'running')
    await pad.hover()
    await expect(arrow).toHaveCSS('animation-play-state', 'paused')
    await expect(pad).not.toHaveCSS('scale', 'none')

    // A hard load of the company URL is the full page, not the drawer, so
    // the sheet is loaded again and the drawer opened from it.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const still = await openDrawer(page)
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '1')
    await expect(still.locator('[data-drawer-scroll-cue]')).toHaveAttribute('data-more', 'true')
    await expect(still.locator('[data-drawer-scroll-cue] > span > span')).toHaveCSS('animation-name', 'none')
  })

  test('axe is clean with the cue up', async ({ page }) => {
    const dialog = await openDrawer(page)
    await expect(dialog.locator('[data-drawer-scroll-cue]')).toHaveAttribute('data-more', 'true')
    const results = await (await axe(page)).analyze()
    expect(results.violations).toEqual([])
  })
})
