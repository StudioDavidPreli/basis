import { test, expect, type Page, type FrameLocator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { adapters } from '@/sources'

// The drivers, read as a file: Playwright's loader does not take the JSON
// import lib/config.ts makes.
const drivers = JSON.parse(readFileSync(path.resolve(process.cwd(), 'data/companies.json'), 'utf8')).drivers as Record<string, { adapter: string; params: Record<string, string | number> }>

// M10 acceptance on the Worker runtime, fixtures mode: the embed routes
// render inside an iframe with theme, reduced motion and preset honored;
// only Basis and the Cadence site may frame them, and nobody may frame the
// sheet; a cell's provenance link is the adapter's real request.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

// A CSS time in ms: the built stylesheet is minified, so 200ms arrives as .2s.
const ms = (t: string) => (t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000)

const EMBEDS = ['/embed/figure?status=agent-updated', '/embed/agent?phase=reading', '/embed/table-sort', '/embed/in-practice']

// A host page on Basis's own origin, served by Playwright, framing one URL.
async function host(page: Page, src: string, origin = 'http://localhost:8787', size: [number, number] = [900, 700]): Promise<FrameLocator> {
  await page.route(`${origin}/__host`, route =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>host</title><body><iframe title="embed" src="${src}" width="${size[0]}" height="${size[1]}"></iframe></body></html>` }),
  )
  await page.goto(`${origin}/__host`)
  return page.frameLocator('iframe[title="embed"]')
}

test.describe('who may frame Basis', () => {
  test('the sheet refuses every frame; an embed names Basis and the Cadence site', async ({ request }) => {
    const sheet = await request.get('/')
    expect(sheet.headers()['content-security-policy']).toBe("frame-ancestors 'none'")
    expect(sheet.headers()['x-frame-options']).toBe('DENY')
    for (const path of EMBEDS) {
      const res = await request.get(path)
      expect(res.headers()['content-security-policy'], path).toBe("frame-ancestors 'self' https://cadence.davidpreli.com http://localhost:8787")
      expect(res.headers()['x-frame-options'], path).toBeUndefined()
    }
  })

  test('a framed embed renders; a framed sheet, or an embed framed from another origin, does not', async ({ page }) => {
    let frame = await host(page, '/embed/figure?status=current')
    await expect(frame.getByRole('heading', { name: 'Figure, current' })).toBeAttached()
    frame = await host(page, '/')
    await expect(frame.locator('table')).toHaveCount(0)
    // 127.0.0.1 is the same server and a different origin.
    frame = await host(page, 'http://localhost:8787/embed/figure?status=current', 'http://127.0.0.1:8787')
    await expect(frame.getByRole('heading', { name: 'Figure, current' })).toHaveCount(0)
  })
})

test.describe('inside a frame, theme, reduced motion and preset are honored', () => {
  // The base duration each preset's own file declares, and the flattened one.
  const BASE = { standard: 200, snappy: 120, cinematic: 500 } as const
  for (const path of EMBEDS) {
    for (const [theme, reduce, preset] of [
      ['passbook', false, 'standard'],
      ['operate', false, 'snappy'],
      ['operate', true, 'cinematic'],
      ['passbook', true, 'snappy'],
    ] as const) {
      test(`${path.split('?')[0]} · ${theme} · reduce ${reduce ? 'on' : 'off'} · ${preset}`, async ({ page }) => {
        const sep = path.includes('?') ? '&' : '?'
        const frame = await host(page, `${path}${sep}theme=${theme}${reduce ? '&reduce=1' : ''}&preset=${preset}`)
        const html = frame.locator('html')
        await expect(html).toHaveAttribute('data-theme', theme)
        await expect(html).toHaveAttribute('data-reduce-motion', reduce ? '1' : '0')
        await expect(html).toHaveAttribute('data-preset', preset)
        const base = await html.evaluate(e => getComputedStyle(e).getPropertyValue('--cadence-duration-base').trim())
        expect(ms(base)).toBeCloseTo(reduce ? 10 : BASE[preset])
        // The paper is the theme's: the frame's body is not the host's white.
        const paper = await frame.locator('body').evaluate(e => getComputedStyle(e).backgroundColor)
        expect(paper).not.toBe('rgba(0, 0, 0, 0)')
        expect(paper).not.toBe('rgb(255, 255, 255)')
        const results = await new AxeBuilder({ page }).include('iframe').analyze()
        expect(results.violations).toEqual([])
      })
    }
  }

  test('the sheet ignores ?preset=: it is always Standard', async ({ page }) => {
    await page.goto('/?preset=cinematic')
    await expect(page.locator('html')).not.toHaveAttribute('data-preset')
    expect(ms(await page.locator('html').evaluate(e => getComputedStyle(e).getPropertyValue('--cadence-duration-base').trim()))).toBeCloseTo(200)
  })
})

// decisions/2026-10-14-reduce-0-on-the-embeds.md: Cadence frames an embed
// reduced, asks the visitor, and reloads it with ?reduce=0. Under the system
// preference that parameter has to win, in the attribute, in the CSS timing
// the package's media block would flatten, and in the rows that run on it.
// The sheet still never overrides the system toward motion.
test.describe('a framed embed asked for motion, under the system preference', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  for (const [query, preset, base] of [
    ['?reduce=0', 'standard', 200],
    ['?reduce=0&preset=cinematic', 'cinematic', 500],
  ] as const) {
    test(`/embed/table-sort${query} runs ${preset} timing, down to the rows`, async ({ page }) => {
      const frame = await host(page, `/embed/table-sort${query}`)
      const html = frame.locator('html')
      await expect(html).toHaveAttribute('data-reduce-motion', '0')
      await expect(html).toHaveAttribute('data-preset', preset)
      for (const [name, value] of [['--cadence-duration-base', base], ['--cadence-delay-none', 0]] as const) {
        const t = await html.evaluate((e, n) => getComputedStyle(e).getPropertyValue(n).trim(), name)
        expect(ms(t), name).toBeCloseTo(value)
      }
      // The sort is CSS: a row's own transition reads the restated value,
      // not the media block's 10ms. (The table shows markers, not logos, so
      // there is no Rive here to check.)
      const durations = await frame.locator('tbody tr').first().evaluate(e => getComputedStyle(e).transitionDuration)
      expect(durations.split(', ').map(ms)).toContain(base)
    })
  }

  test('without the parameter the embed stays reduced, and the sheet ignores it', async ({ page }) => {
    const frame = await host(page, '/embed/table-sort')
    await expect(frame.locator('html')).toHaveAttribute('data-reduce-motion', '1')
    expect(ms(await frame.locator('html').evaluate(e => getComputedStyle(e).getPropertyValue('--cadence-duration-base').trim()))).toBeCloseTo(10)
    await page.goto('/?reduce=0')
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '1')
    await expect(page.locator('html')).not.toHaveAttribute('data-preset')
    expect(ms(await page.locator('html').evaluate(e => getComputedStyle(e).getPropertyValue('--cadence-duration-base').trim()))).toBeCloseTo(10)
  })

  test('?reduce=0 is never stored', async ({ page }) => {
    let frame = await host(page, '/embed/table-sort?reduce=0')
    await expect(frame.locator('html')).toHaveAttribute('data-reduce-motion', '0')
    frame = await host(page, '/embed/table-sort')
    await expect(frame.locator('html')).toHaveAttribute('data-reduce-motion', '1')
    expect(await frame.locator('html').evaluate(() => localStorage.getItem('basis-reduce'))).toBeNull()
  })
})

// decisions/2026-10-14-cadence-stocks-on-the-embeds.md: framed in Cadence,
// the embed wears Cadence's colors; unframed, or on the sheet, it does not.
const cadenceStocks = JSON.parse(readFileSync(path.resolve(process.cwd(), 'data/companies.json'), 'utf8')).cadenceStocks as Record<string, { paper: string; ink: string; tone: string }>
const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

test.describe('the Cadence stocks, framed only', () => {
  for (const [name, stock] of Object.entries(cadenceStocks).filter(([k]) => !k.startsWith('_'))) {
    test(`${name}: paints Cadence's paper and ink, flat, axe clean, nothing stored`, async ({ page }) => {
      const frame = await host(page, `/embed/table-sort?theme=${name}`)
      const html = frame.locator('html')
      await expect(html).toHaveAttribute('data-theme', name)
      const body = frame.locator('body')
      await expect(body).toHaveCSS('background-color', rgb(stock.paper))
      await expect(body).toHaveCSS('color', rgb(stock.ink))
      await expect(body).toHaveCSS('background-image', 'none')
      expect(await html.evaluate(e => getComputedStyle(e).colorScheme)).toBe(stock.tone)
      expect(await html.evaluate(() => localStorage.getItem('basis-theme'))).toBeNull()
      const results = await new AxeBuilder({ page }).include('iframe').analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('unframed, the embed ignores ?theme=cadence-*; the sheet ignores it', async ({ page }) => {
    await page.goto('/embed/table-sort?theme=cadence-dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(passbook|operate)$/)
    await page.goto('/?theme=cadence-dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', /^(passbook|operate)$/)
  })
})

test.describe('the table-sort embed', () => {
  test('sorts by keyboard inside the frame, names are text, and a figure’s provenance link is the adapter’s request', async ({ page }) => {
    const frame = await host(page, '/embed/table-sort')
    const level = frame.getByRole('columnheader', { name: /Level/ })
    await expect(level).toHaveAttribute('aria-sort', 'none')
    await level.getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(level).toHaveAttribute('aria-sort', 'ascending')
    const values = await frame.locator('tbody tr').evaluateAll(rows =>
      rows.map(r => parseFloat((r.querySelector('[aria-label^="Level for"]')?.getAttribute('aria-label') ?? '').split(': ')[1] ?? 'NaN')),
    )
    expect(values).toEqual([...values].sort((a, b) => a - b))
    await page.keyboard.press('Enter')
    await expect(level).toHaveAttribute('aria-sort', 'descending')
    // Text, not links: following one would load the full page in the frame.
    await expect(frame.getByRole('link', { name: /Anchor Kaze/ })).toHaveCount(0)

    // Provenance: every link the dialog lists is a URL an adapter builds.
    const known = Object.values(drivers).map(d => adapters[d.adapter]!.latestUrl(d.params))
    await frame.getByRole('button', { name: /^Level for Anchor Kaze/ }).click()
    const links = frame.getByRole('dialog', { name: 'Provenance' }).getByRole('link')
    await expect(links.first()).toBeVisible()
    for (const href of await links.evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href))) expect(known).toContain(href)
  })
})

// decisions/2026-10-15-the-in-practice-stage.md: the stage Cadence frames.
// Its height is the number Cadence sizes the frame to, so it is pinned here
// at both ends of the width range, in Chromium and WebKit.
const STAGE_HEIGHT = 820

test.describe('the in-practice stage', () => {
  for (const width of [560, 880]) {
    test(`in-practice frame at ${width} px is ${STAGE_HEIGHT} px tall, no inner scroll, the legend on one line`, async ({ page }) => {
      const frame = await host(page, '/embed/in-practice', 'http://localhost:8787', [width, STAGE_HEIGHT])
      await expect(frame.locator('[data-series]')).toHaveCount(4)
      const doc = await frame.locator('html').evaluate(e => ({ h: e.scrollHeight, w: e.scrollWidth, main: document.querySelector('main')!.getBoundingClientRect().height }))
      expect(doc).toEqual({ h: STAGE_HEIGHT, w: width, main: STAGE_HEIGHT })
      // The plot takes what the ledger leaves; the ledger is never clipped.
      const plot = (await frame.locator('[role="img"]').boundingBox())!
      expect(plot.height).toBeGreaterThanOrEqual(176)
      const last = await frame.locator('tbody tr').last().evaluate(r => r.getBoundingClientRect().bottom)
      expect(last).toBeLessThanOrEqual(STAGE_HEIGHT)
      const tops = await frame.locator('header li').evaluateAll(lis => new Set(lis.map(li => Math.round(li.getBoundingClientRect().top))).size)
      expect(tops).toBe(1)
      // The bottom row's provenance opens above it rather than scrolling the frame.
      await frame.getByRole('button', { name: /^Level for Ember Shamal/ }).click()
      await expect(frame.getByRole('dialog', { name: 'Provenance' })).toBeVisible()
      expect(await frame.locator('html').evaluate(e => [e.scrollHeight, window.scrollY])).toEqual([STAGE_HEIGHT, 0])
    })
  }

  test('reads nothing but its own origin: no Worker read, no refresh, no source', async ({ page }) => {
    const requests: string[] = []
    page.on('request', r => requests.push(r.url()))
    const frame = await host(page, '/embed/in-practice?reduce=0')
    await expect(frame.locator('[data-series]')).toHaveCount(4)
    await frame.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await frame.locator('tbody tr').first().hover()
    for (const url of requests) {
      expect(new URL(url).origin, url).toBe('http://localhost:8787')
      expect(new URL(url).pathname, url).not.toMatch(/^\/api\//)
    }
  })

  test('the frozen figures read as of their snapshot, and a row and its line light together', async ({ page }) => {
    const frame = await host(page, '/embed/in-practice')
    // A frozen copy aged to today would read stale; read at its own moment,
    // no Level is.
    expect(await frame.locator('[data-status]').count()).toBeGreaterThan(0)
    await expect(frame.locator('[data-status="stale"]')).toHaveCount(0)
    await expect(frame.getByText(/snapshot of \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC/)).toBeVisible()
    // Sort moves rows, never lines.
    const lines = await frame.locator('[data-series]').evaluateAll(ps => ps.map(p => p.getAttribute('d')))
    await frame.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await frame.getByRole('checkbox').nth(3).check()
    expect(await frame.locator('[data-series]').evaluateAll(ps => ps.map(p => p.getAttribute('d')))).toEqual(lines)
    // Row to line.
    await frame.locator('tbody tr', { hasText: 'Ember Shamal' }).hover()
    await expect(frame.locator('[data-series="jump-dubai"]')).toHaveAttribute('data-hover', 'true')
    await expect(frame.locator('[data-series="ou-tokyo"]')).not.toHaveAttribute('data-hover')
    // No brush: a drag across the plot sets no window.
    const box = (await frame.locator('[data-series]').first().boundingBox())!
    await page.mouse.move(box.x + 40, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 160, box.y + box.height / 2)
    await expect(frame.locator('[data-dragging]')).toHaveCount(0)
    await page.mouse.up()
  })
})
