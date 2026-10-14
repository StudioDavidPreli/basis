import { test, expect } from '@playwright/test'

// The tab icon: the page links it, and each file is served with its own type.

test.describe('the favicon', () => {
  test('the page links the svg, the ico and the apple icon', async ({ page }) => {
    await page.goto('/')
    const hrefs = await page.locator('head link[rel~="icon"], head link[rel="apple-touch-icon"]').evaluateAll(
      (links) => links.map((l) => (l as HTMLLinkElement).getAttribute('href') ?? ''),
    )
    expect(hrefs.some((h) => h.includes('/icon.svg'))).toBe(true)
    expect(hrefs.some((h) => h.includes('/favicon.ico'))).toBe(true)
    expect(hrefs.some((h) => h.includes('/apple-icon.png'))).toBe(true)
  })

  for (const [path, type] of [
    ['/favicon.ico', /image\/(x-icon|vnd\.microsoft\.icon)/],
    ['/icon.svg', /image\/svg\+xml/],
    ['/apple-icon.png', /image\/png/],
  ] as const) {
    test(`${path} is served as an image`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toMatch(type)
    })
  }

  test('the svg carries a dark variant', async ({ request }) => {
    const body = await (await request.get('/icon.svg')).text()
    expect(body).toContain('prefers-color-scheme:dark')
  })
})
