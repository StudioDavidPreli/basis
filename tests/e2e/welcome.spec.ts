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
  // (contracts/agent-presence.md, "Basis title"). Measured as the logos spec
  // measures its posters: the rest-pose poster drawn at the canvas's pixel
  // size against the canvas's own pixels after the entrance, sampled across
  // two seconds because the idle turns or swells one marker at a time and
  // moves the drawn bounds by up to fourteen device pixels; the closest
  // sample has to agree on every edge. At delivery the .riv's art sat 18 px
  // up and left of the poster's; David re-exported the posters 2026-10-16.
  test('the title canvas at rest draws where its poster does', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const title = welcome(page).locator('[data-title]')
    await expect(title).toHaveAttribute('data-title', 'animated', { timeout: 15_000 })
    const result = await title.evaluate(async (box: HTMLElement) => {
      type Bounds = { l: number; r: number; t: number; b: number }
      const bounds = (data: Uint8ClampedArray, w: number, h: number): Bounds | null => {
        let l = w, r = -1, t = h, b = -1
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (data[(y * w + x) * 4 + 3]! > 40) {
              if (x < l) l = x
              if (x > r) r = x
              if (y < t) t = y
              if (y > b) b = y
            }
        return r < 0 ? null : { l, r, t, b }
      }
      const canvas = box.querySelector('canvas')!
      const w = canvas.width, h = canvas.height
      // The theme's rest-pose poster, drawn at the canvas's pixel size.
      const theme = document.documentElement.getAttribute('data-theme') === 'operate' ? 'Dark' : 'Light'
      const img = new Image()
      img.src = `/fallbacks/basisModalTitles${theme}.svg`
      await img.decode()
      const off = document.createElement('canvas')
      off.width = w; off.height = h
      const ctx = off.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const poster = bounds(ctx.getImageData(0, 0, w, h).data, w, h)
      // After the entrance (about a second and a half), the canvas across two seconds.
      await new Promise(r => setTimeout(r, 2500))
      const cctx = canvas.getContext('2d', { willReadFrequently: true })!
      const samples: Bounds[] = []
      for (let i = 0; i < 12; i++) {
        const s = bounds(cctx.getImageData(0, 0, w, h).data, w, h)
        if (s) samples.push(s)
        await new Promise(r => setTimeout(r, 170))
      }
      if (!poster || samples.length === 0) return { poster, samples: samples.length, best: null, delta: null, size: [w, h] }
      const delta = (s: Bounds) => Math.max(Math.abs(s.l - poster.l), Math.abs(s.r - poster.r), Math.abs(s.t - poster.t), Math.abs(s.b - poster.b))
      const best = samples.reduce((a, s) => (delta(s) < delta(a) ? s : a))
      return { poster, samples: samples.length, best, delta: delta(best), size: [w, h] }
    })
    expect(result.poster, 'the rest-pose poster drew nothing').not.toBeNull()
    expect(result.best, 'the canvas drew nothing').not.toBeNull()
    expect(result.delta, `rest-pose poster ${JSON.stringify(result.poster)} vs the closest canvas frame ${JSON.stringify(result.best)} in ${JSON.stringify(result.size)}`).toBeLessThanOrEqual(4)
  })

  // The text poster is the placeholder under motion
  // (decisions/2026-10-16-the-text-poster-is-the-placeholder.md): the canvas's
  // first frame must put the two lines where the poster has them, or the
  // handover is a jump. Measured as the logos spec measures its posters: the
  // poster drawn at the canvas's pixel size against the canvas's own pixels,
  // in the text's region only (the right four fifths of the frame; the
  // markers enter in the left fifth while the title holds), sampled across
  // the first second and a half. The first export of the posters sat 18
  // artboard pixels down and right of the canvas's art; David re-exported
  // all four on 2026-10-16 from the title script's own origin.
  test('the title canvas draws its text where the text poster has it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const title = welcome(page).locator('[data-title]')
    await expect(title).toHaveAttribute('data-title', /pending|animated/)
    const pendingSrc = await title.locator('img').getAttribute('src')
    expect(pendingSrc).toMatch(/basisModalTitlesText(Light|Dark)\.svg$/)
    await expect(title).toHaveAttribute('data-title', 'animated', { timeout: 15_000 })
    const result = await title.evaluate(async (box: HTMLElement) => {
      type Bounds = { l: number; r: number; t: number; b: number }
      const bounds = (data: Uint8ClampedArray, w: number, h: number, from: number): Bounds | null => {
        let l = w, r = -1, t = h, b = -1
        for (let y = 0; y < h; y++)
          for (let x = from; x < w; x++)
            if (data[(y * w + x) * 4 + 3]! > 40) {
              if (x < l) l = x
              if (x > r) r = x
              if (y < t) t = y
              if (y > b) b = y
            }
        return r < 0 ? null : { l, r, t, b }
      }
      const canvas = box.querySelector('canvas')!
      const w = canvas.width, h = canvas.height
      const from = Math.round(w * 0.2)
      const img = box.querySelector('img')!
      await img.decode()
      const off = document.createElement('canvas')
      off.width = w; off.height = h
      const ctx = off.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const poster = bounds(ctx.getImageData(0, 0, w, h).data, w, h, from)
      const cctx = canvas.getContext('2d', { willReadFrequently: true })!
      const samples: Bounds[] = []
      for (let i = 0; i < 10; i++) {
        const s = bounds(cctx.getImageData(0, 0, w, h).data, w, h, from)
        if (s) samples.push(s)
        await new Promise(r => setTimeout(r, 150))
      }
      if (!poster || samples.length === 0) return { poster, samples: samples.length, worst: null, delta: null, size: [w, h] }
      const delta = (s: Bounds) => Math.max(Math.abs(s.l - poster.l), Math.abs(s.r - poster.r), Math.abs(s.t - poster.t), Math.abs(s.b - poster.b))
      // The title holds through the entrance, so every sample has to agree.
      const worst = samples.reduce((a, s) => (delta(s) > delta(a) ? s : a))
      return { poster, samples: samples.length, worst, delta: delta(worst), size: [w, h] }
    })
    expect(result.poster, 'the text poster drew nothing').not.toBeNull()
    expect(result.worst, 'the canvas drew nothing').not.toBeNull()
    expect(result.delta, `text poster ${JSON.stringify(result.poster)} vs the farthest canvas frame ${JSON.stringify(result.worst)} in ${JSON.stringify(result.size)}`).toBeLessThanOrEqual(4)
  })
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
