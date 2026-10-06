import { test, expect, type Page } from '@playwright/test'

// The logos on the sheet (contracts/agent-presence.md, "Company logos" and
// "Acceptance"). Reduced motion is outside the runtime: the page fetches no
// .riv and no WASM and shows the posters. With motion allowed, every
// delivered file loads, passes the contract's name check (a mismatch is a
// console error and keeps the poster), and draws over its poster.

const RIVE = /\.riv$|\.wasm$/

// The logos with art, read off the page: lib/logos.ts decides, and its unit
// test holds that against public/.
const withArt = (page: Page) => page.locator('tbody [data-artboard]')
const animated = (page: Page) => page.locator('tbody [data-riv]')

function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', r => urls.push(r.url()))
  return urls
}

test.describe('company logos', () => {
  test('under reduced motion: posters, and no runtime, WASM or .riv on the wire', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const urls = recordRequests(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const logos = await withArt(page).all()
    expect(logos.length).toBeGreaterThan(0)
    for (const logo of logos) {
      await expect(logo).toHaveAttribute('data-logo', 'poster')
      const poster = logo.locator('img:visible')
      await expect(poster).toHaveCount(1)
      await expect(poster).toHaveAttribute('src', /Light\.svg$/)
      expect(await poster.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
    }
    expect(urls.filter(u => RIVE.test(new URL(u).pathname))).toEqual([])
  })

  test('the dark stock shows the dark poster', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/')
    await expect(withArt(page).first().locator('img:visible')).toHaveAttribute('src', /Dark\.svg$/)
  })

  test('with motion allowed every delivered file loads, passes its name check, and draws', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const errors: string[] = []
    page.on('console', m => m.type() === 'error' && errors.push(m.text()))
    const urls = recordRequests(page)
    await page.goto('/')
    const logos = await animated(page).all()
    expect(logos.length).toBeGreaterThan(0)
    for (const logo of logos) {
      const id = await logo.getAttribute('data-entity')
      await expect(logo, id!).toHaveAttribute('data-logo', 'animated', { timeout: 15_000 })
      await expect(logo.locator('canvas')).toBeVisible()
      await expect(logo.locator('img:visible')).toHaveCount(0)
    }
    expect(errors).toEqual([])
    // Self-hosted: the WASM comes from this origin, never a CDN.
    const wasm = urls.filter(u => new URL(u).pathname.endsWith('.wasm'))
    expect(wasm.length).toBeGreaterThan(0)
    for (const u of wasm) expect(new URL(u).origin).toBe(new URL(page.url()).origin)
  })
})
