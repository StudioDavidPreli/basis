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

const EMBEDS = ['/embed/figure?status=agent-updated', '/embed/agent?phase=reading', '/embed/table-sort']

// A host page on Basis's own origin, served by Playwright, framing one URL.
async function host(page: Page, src: string, origin = 'http://localhost:8787'): Promise<FrameLocator> {
  await page.route(`${origin}/__host`, route =>
    route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>host</title><body><iframe title="embed" src="${src}" width="900" height="700"></iframe></body></html>` }),
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
      expect(res.headers()['content-security-policy'], path).toBe("frame-ancestors 'self' https://cadence.davidpreli.com")
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
