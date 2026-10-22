import { test, expect } from '@playwright/test'
import { axe } from './land'

// M1 acceptance: "hello" builds and serves through the Worker runtime, axe
// passes on the empty page, and the two attributes the inline script sets
// are on <html> before anything else runs.

test.describe('the empty page', () => {
  test('serves the sheet and passes axe', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Basis')
    const results = await (await axe(page)).analyze()
    expect(results.violations).toEqual([])
  })

  test('sets theme and reduced-motion attributes before hydration', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('data-reduce-motion', '1')
    await expect(html).toHaveAttribute('data-theme', 'operate')
    // The attribute path flattens the CSS tokens exactly as the media block does.
    const base = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cadence-duration-base').trim(),
    )
    expect(base).toBe('10ms')
  })

  test('?reduce=1 overrides a no-preference OS setting', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/?reduce=1')
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '1')
  })

  test('the Cadence tokens are on the page', async ({ page }) => {
    await page.goto('/')
    const ease = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cadence-ease-standard').trim(),
    )
    // The minifier rewrites `0.4` as `.4` in the shipped stylesheet, so the
    // authored spelling is not what the browser holds. Compare the numbers.
    // (The same rewrite once blanked every Modal on Cadence when a parser
    // assumed the authored form; Basis reads CSS tokens only through var(),
    // and JS reads the Framer module, so no Basis code parses this string.)
    const numbers = ease.match(/[\d.]+/g)!.map(Number)
    expect(ease.startsWith('cubic-bezier(')).toBe(true)
    expect(numbers).toEqual([0.4, 0, 0.2, 1])
  })
})
