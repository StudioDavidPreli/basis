import { test, expect, type Page } from '@playwright/test'

// What the built-output suite cannot see: `next dev` runs React's Strict
// Mode, which runs every effect twice on mount, and reports hydration
// mismatches that production stays quiet about. Each spec here is a bug
// that shipped past the main gate in September 2026 (docs/notes/
// 2026-09-17-strict-mode-and-the-drawer-open.md), watched the way David
// found it: on the dev server, frame by frame.

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

// Warm the routes the specs cross, so a compile does not land inside a
// measurement.
async function warm(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: /Anchor Kaze/ }).click()
  await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
  await page.getByRole('link', { name: /Keel London/ }).click()
  await expect(page.getByRole('dialog', { name: /Keel London/ })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe('under next dev, with Strict Mode', () => {
  test('the drawer opens on the spring, not in one frame', async ({ page }) => {
    await warm(page)
    // Sample the dialog's width on every animation frame from the moment
    // it appears, so a snap (0 then full) and a spring (a rising series)
    // are told apart.
    await page.evaluate(() => {
      const w = window as unknown as { samples: number[] }
      w.samples = []
      const frame = document.getElementById('frame')!
      const observer = new MutationObserver(() => {
        const d = frame.querySelector('dialog[open]:not([data-exiting])')
        if (!d) return
        observer.disconnect()
        const tick = () => {
          w.samples.push(Math.round(d.getBoundingClientRect().width))
          if (w.samples.length < 90) requestAnimationFrame(tick)
        }
        tick()
      })
      observer.observe(frame, { childList: true })
    })
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.waitForTimeout(1600)
    const samples = await page.evaluate(() => (window as unknown as { samples: number[] }).samples)
    const distinct = [...new Set(samples)]
    const final = samples[samples.length - 1]!
    // The Strict Mode bug: the first run measured, the second measured its
    // own zero, and the spring went from nothing to nothing.
    expect(samples[0]).toBeLessThan(40)
    expect(distinct.length).toBeGreaterThan(8)
    expect(final).toBeGreaterThan(300)
    // Rising, allowing the damped spring's one-pixel settle.
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]! - 1)
    // Settled: the stylesheet owns the width again.
    const inline = await page.locator('dialog[open]').evaluate(el => (el as HTMLElement).style.width)
    expect(inline).toBe('')
  })

  test('an entity switch scrambles from the old name, never from the new one settled', async ({ page }) => {
    await warm(page)
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await page.waitForTimeout(400)
    // Record every text the heading shows from here on.
    await page.evaluate(() => {
      const w = window as unknown as { shown: string[] }
      w.shown = []
      const read = () => {
        const h = document.querySelector('[data-drawer-heading]')
        if (!h) return
        const glyphs = h.querySelector('[aria-hidden="true"]:not(svg)')
        const text = (glyphs ? glyphs.textContent : h.textContent) ?? ''
        if (w.shown[w.shown.length - 1] !== text) w.shown.push(text)
      }
      new MutationObserver(read).observe(document.getElementById('frame')!, { childList: true, characterData: true, subtree: true })
      read()
    })
    await page.getByRole('link', { name: /Keel London/ }).click()
    await expect(page.getByRole('dialog', { name: /Keel London/ })).toBeVisible()
    await page.waitForTimeout(1200)
    const shown = await page.evaluate(() => (window as unknown as { shown: string[] }).shown)
    // The frame before the churn is the old name; the settled-new-name
    // flash showed "Keel London" plain here, then scrambled it from nothing.
    expect(shown[0]).toBe('Anchor Kaze')
    expect(shown[1]).not.toBe('Keel London')
    expect(shown[1]).not.toBe('Anchor Kaze')
    // A churn, then the new name. (The noise alphabet is drawn from the two
    // names, so a mid-churn frame can spell the target by chance; only the
    // first frame and the last are asserted.)
    expect(shown.length).toBeGreaterThan(3)
    expect(shown[shown.length - 1]).toBe('Keel London')
    // The frozen-at-zero bug: the heading stayed on its first noise frame.
    // Settled means plain text, no hidden copy for assistive tech left.
    await expect(page.locator('[data-drawer-heading]')).toHaveText('Keel London')
    await expect(page.locator('[data-drawer-heading] .sr-only')).toHaveCount(0)
  })

  test('the sheet hydrates and opens the drawer with nothing in the console', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/?reduce=1')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    const dialog = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(dialog).toBeVisible()
    // Escape is the dialog's own handler; wait for its content to have
    // taken focus, or the key lands on the link behind it.
    await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Hydration mismatches and Strict Mode complaints are console errors
    // in development and silent in production.
    expect(errors).toEqual([])
  })
})
