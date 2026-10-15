import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The welcome on landing (decisions/2026-10-15-a-welcome-on-landing.md) and
// the four rows the sheet lands with
// (decisions/2026-10-15-four-rows-charted-on-landing.md). Every other spec
// runs with the welcome dismissed (playwright.config.ts); these start from
// empty storage.
test.use({ storageState: { cookies: [], origins: [] } })

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

const welcome = (page: Page) => page.getByRole('dialog', { name: 'Basis, sourced-data surface' })

async function transparency(page: Page, value: 'reduce' | 'no-preference') {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value }] })
}

test.describe('the welcome', () => {
  test('opens on landing over the chart, modal, with Close focused', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const dialog = welcome(page)
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(el => (el as HTMLDialogElement).open && el.matches(':modal'))).toBe(true)
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await expect(dialog.getByRole('listitem')).toHaveCount(4)
    // Over the chart's box at desktop width.
    await expect(dialog).toHaveAttribute('data-placement', 'chart')
    const [box, chart] = await Promise.all([dialog.boundingBox(), page.locator('section[aria-labelledby="chart-title"]').boundingBox()])
    expect(box!.y).toBeGreaterThanOrEqual(chart!.y)
    expect(box!.y + box!.height).toBeLessThanOrEqual(chart!.y + chart!.height + 1)
    // The sheet holds still under it.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden')
    expect(errors).toEqual([])
  })

  test('Close dismisses it for the visit only; ticked, for good', async ({ page }) => {
    await page.goto('/')
    await welcome(page).getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
    await page.reload()
    await expect(welcome(page)).toBeVisible()
    await welcome(page).getByRole('checkbox', { name: 'Don’t show again' }).check()
    await welcome(page).getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('basis-welcome'))).toBe('dismissed')
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('Escape closes it as Close does, and focus lands back on the page', async ({ page }) => {
    await page.goto('/')
    await expect(welcome(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The sheet is reachable again: the palette opens from the keyboard.
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  })

  test('the palette shows it again, with the box as stored, and unticking clears the flag', async ({ page }) => {
    await page.goto('/')
    await welcome(page).getByRole('checkbox', { name: 'Don’t show again' }).check()
    await welcome(page).getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Command or name' }).fill('welcome')
    await page.keyboard.press('Enter')
    await expect(welcome(page)).toBeVisible()
    const box = welcome(page).getByRole('checkbox', { name: 'Don’t show again' })
    await expect(box).toBeChecked()
    await box.uncheck()
    await welcome(page).getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('basis-welcome'))).toBeNull()
  })

  test('the backdrop dims with the paper, and is solid under reduced transparency', async ({ page }) => {
    const backdrop = () => welcome(page).evaluate(el => getComputedStyle(el, '::backdrop').backgroundColor)
    await transparency(page, 'no-preference')
    await page.goto('/')
    await expect(welcome(page)).toBeVisible()
    expect(await backdrop()).toMatch(/^(rgba|color)\(/)
    await transparency(page, 'reduce')
    expect(await backdrop()).toBe('rgb(211, 227, 198)')
  })

  test('the title paints its canvas under motion, and shows the poster under reduced motion with no runtime fetched', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    await expect(welcome(page).locator('[data-title]')).toHaveAttribute('data-title', 'animated', { timeout: 15_000 })
    expect(errors).toEqual([])

    const fetched: string[] = []
    await page.emulateMedia({ reducedMotion: 'reduce' })
    page.on('request', r => {
      if (/\.(riv|wasm)$/.test(new URL(r.url()).pathname)) fetched.push(r.url())
    })
    await page.reload()
    const title = welcome(page).locator('[data-title]')
    await expect(title).toHaveAttribute('data-title', 'poster')
    await expect(title.locator('img').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    // The ledger's rows show Markers, so nothing else on the sheet asks for
    // the runtime either.
    expect(fetched).toEqual([])
  })

  test('axe is clean with it open', async ({ page }) => {
    await page.goto('/')
    await expect(welcome(page)).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('a hard load of an entity page opens no welcome', async ({ page }) => {
    await page.goto('/company/ou-tokyo')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  // The rest pose and the poster must agree within four device pixels
  // (contracts/agent-presence.md, "Basis title"). At delivery the .riv's
  // art sat 18 px up and left of the poster's; this waits on a re-export.
  test.fixme('the title canvas at rest draws where its poster does', async () => {})
})

test.describe('the sheet lands charted', () => {
  test('Comparables lands with its four rows charted, in order; Regions lands empty', async ({ page }) => {
    await page.goto('/')
    await welcome(page).getByRole('button', { name: 'Close' }).click()
    for (const name of ['Anchor Kaze', 'Plumb Varsha', 'Windward Sydney', 'Ember Shamal']) {
      await expect(page.getByRole('checkbox', { name: `Chart ${name}` })).toBeChecked()
    }
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(4)
    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(0)
    // A dataset switch clears the selection; coming back does not restore it.
    await page.getByRole('button', { name: 'Comparables' }).click()
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(0)
  })
})
