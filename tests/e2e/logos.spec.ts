import { test, expect, type Page, type Locator } from '@playwright/test'

// The logos (contracts/agent-presence.md, "Company logos" and "Acceptance").
// A logo lives in the drawer, above its heading; the ledger keeps the Marker.
// Reduced motion is outside the runtime: the page fetches no .riv and no WASM
// and the drawer shows the poster. With motion allowed, every delivered file
// loads, passes the contract's name check (a mismatch is a console error and
// keeps the poster), and draws over its poster.

const RIVE = /\.riv$|\.wasm$/

function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', r => urls.push(r.url()))
  return urls
}

// Which companies have art is read off the page, drawer by drawer: lib/logos.ts
// decides, its unit test holds that against public/, and nothing here types
// an id. Yields the logo box of every drawer that carries one.
async function* deliveredLogos(page: Page): AsyncGenerator<Locator> {
  await page.goto('/')
  const hrefs = await page.locator('tbody a[href^="/company/"]').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).getAttribute('href')!))
  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of hrefs) {
    await page.goto('/')
    await page.click(`a[href="${href}"]`)
    // The drawer is the intercepting route: wait for its heading before
    // asking whether it carries art, or the count is taken on an empty dialog.
    await page.locator('dialog [data-drawer-heading]').waitFor()
    const logo = page.locator('dialog [data-artboard]')
    if ((await logo.count()) > 0) yield logo
  }
}

test.describe('company logos', () => {
  test('under reduced motion: posters in the drawers, and no runtime, WASM or .riv on the wire', async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const urls = recordRequests(page)
    let seen = 0
    for await (const logo of deliveredLogos(page)) {
      seen++
      await expect(logo).toHaveAttribute('data-logo', 'poster')
      const poster = logo.locator('img:visible')
      await expect(poster).toHaveCount(1)
      await expect(poster).toHaveAttribute('src', /Light\.svg$/)
      // The poster has to have decoded, not merely be in the DOM: read its
      // size after decode(), or the first drawer's img can still be loading.
      expect(await poster.evaluate(async (i: HTMLImageElement) => { await i.decode(); return i.naturalWidth })).toBeGreaterThan(0)
      await page.waitForLoadState('networkidle')
    }
    expect(seen).toBeGreaterThan(0)
    expect(urls.filter(u => RIVE.test(new URL(u).pathname))).toEqual([])
  })

  test('the dark stock shows the dark poster', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    for await (const logo of deliveredLogos(page)) {
      await expect(logo.locator('img:visible')).toHaveAttribute('src', /Dark\.svg$/)
      break
    }
  })

  test('with motion allowed every delivered file loads, passes its name check, and draws', async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const errors: string[] = []
    page.on('console', m => m.type() === 'error' && errors.push(m.text()))
    const urls = recordRequests(page)
    let seen = 0
    for await (const logo of deliveredLogos(page)) {
      if (!(await logo.getAttribute('data-riv'))) continue
      seen++
      const id = await logo.getAttribute('data-entity')
      await expect(logo, id!).toHaveAttribute('data-logo', 'animated', { timeout: 15_000 })
      await expect(logo.locator('canvas')).toBeVisible()
      await expect(logo.locator('img:visible')).toHaveCount(0)
    }
    expect(seen).toBeGreaterThan(0)
    expect(errors).toEqual([])
    // Self-hosted: the WASM comes from this origin, never a CDN.
    const wasm = urls.filter(u => new URL(u).pathname.endsWith('.wasm'))
    expect(wasm.length).toBeGreaterThan(0)
    for (const u of wasm) expect(new URL(u).origin).toBe(new URL(page.url()).origin)
  })
})

// The poster is a still of the artboard (contracts/agent-presence.md): when
// the canvas replaces it, nothing may move. Measured, not trusted: the drawn
// bounds of the poster, drawn into an offscreen canvas of the Rive canvas's
// pixel size, against the Rive canvas's own pixels, sampled across its first
// two seconds because an authored loop moves the drawing (Keel's march lifts
// its figures by a few pixels). The closest sample has to agree on every
// edge within a few device pixels. A poster exported from the drawing's own
// bounds instead of the artboard fails this by tens of pixels (2026-10-08).
test.describe('posters are stills of their artboards', () => {
  const TOLERANCE = 4 // device pixels, per edge

  test("every delivered poster's drawn bounds match its canvas", async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    let delivered = 0
    for await (const logo of deliveredLogos(page)) {
      if (!(await logo.getAttribute('data-riv'))) continue
      delivered++
      const id = (await logo.getAttribute('data-entity'))!
      await expect(logo, id).toHaveAttribute('data-logo', 'animated', { timeout: 15_000 })
      const result = await logo.evaluate(async (box: HTMLElement) => {
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
        // The poster, drawn at the canvas's pixel size.
        const img = [...box.querySelectorAll('img')].find(i => getComputedStyle(i).display !== 'none')!
        await (img as HTMLImageElement).decode()
        const off = document.createElement('canvas')
        off.width = w; off.height = h
        const ctx = off.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        const poster = bounds(ctx.getImageData(0, 0, w, h).data, w, h)
        // The canvas, sampled over its first two seconds.
        const samples: Bounds[] = []
        const cctx = canvas.getContext('2d', { willReadFrequently: true })
        for (let i = 0; i < 12; i++) {
          await new Promise(r => setTimeout(r, 150))
          const data = cctx
            ? cctx.getImageData(0, 0, w, h).data
            : (() => { ctx.clearRect(0, 0, w, h); ctx.drawImage(canvas, 0, 0); return ctx.getImageData(0, 0, w, h).data })()
          const s = bounds(data, w, h)
          if (s) samples.push(s)
        }
        if (!poster || samples.length === 0) return { poster, samples: samples.length, best: null, delta: null, size: [w, h] }
        const delta = (s: Bounds) => Math.max(Math.abs(s.l - poster.l), Math.abs(s.r - poster.r), Math.abs(s.t - poster.t), Math.abs(s.b - poster.b))
        const best = samples.reduce((a, s) => (delta(s) < delta(a) ? s : a))
        return { poster, samples: samples.length, best, delta: delta(best), size: [w, h] }
      })
      expect.soft(result.poster, `${id}: poster drew nothing`).not.toBeNull()
      expect.soft(result.best, `${id}: canvas drew nothing in two seconds`).not.toBeNull()
      if (result.delta !== null)
        expect.soft(result.delta, `${id}: poster ${JSON.stringify(result.poster)} vs closest canvas frame ${JSON.stringify(result.best)} in ${JSON.stringify(result.size)}`).toBeLessThanOrEqual(TOLERANCE)
    }
    expect(delivered, 'no drawer showed delivered art').toBeGreaterThan(0)
  })
})
