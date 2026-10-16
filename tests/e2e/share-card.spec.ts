import { test, expect } from '@playwright/test'

// The share card (decisions/2026-10-15-the-share-card.md): the tags are in
// the server's HTML, where crawlers read them, with absolute URLs, and the
// files they name are served as WebP at the sizes the tags state.
const meta = (html: string, key: string) => [...html.matchAll(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`, 'g'))].map(m => m[1])

test('the sheet carries the share card, and both images are served', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(meta(html, 'og:image')).toEqual(['https://basis.davidpreli.com/og/basis-1200x630.webp', 'https://basis.davidpreli.com/og/basis-630x630.webp'])
  expect(meta(html, 'og:image:width')).toEqual(['1200', '630'])
  expect(meta(html, 'og:image:height')).toEqual(['630', '630'])
  const title = 'Basis · A sourced-data surface built on the Cadence motion system'
  const description = 'Simulated companies, real public data, provenance on every figure.'
  expect(html).toContain(`<title>${title}</title>`)
  expect(meta(html, 'og:title')).toEqual([title])
  expect(meta(html, 'twitter:title')).toEqual([title])
  expect(meta(html, 'description')).toEqual([description])
  expect(meta(html, 'og:description')).toEqual([description])
  expect(meta(html, 'twitter:card')).toEqual(['summary_large_image'])
  expect(meta(html, 'twitter:image')).toEqual(['https://basis.davidpreli.com/og/basis-1200x630.webp'])
  for (const path of ['/og/basis-1200x630.webp', '/og/basis-630x630.webp']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
    expect(res.headers()['content-type'], path).toContain('image/webp')
    const body = await res.body()
    expect(body.subarray(8, 12).toString('ascii'), path).toBe('WEBP')
  }
})

test('an entity page keeps its own title and inherits the card', async ({ request }) => {
  const html = await (await request.get('/company/ou-tokyo')).text()
  expect(html).toContain('<title>Anchor Kaze · Basis</title>')
  expect(meta(html, 'og:image')[0]).toBe('https://basis.davidpreli.com/og/basis-1200x630.webp')
})
