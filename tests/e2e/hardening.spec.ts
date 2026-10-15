import { test, expect, type Page } from '@playwright/test'
import { landEmpty } from './land'

// M9 on the Worker runtime, fixtures mode: no console error in any of the
// four theme × reduced-motion combinations, on the sheet and on a drawer
// deep link; and a tick across every figure at once does not re-render
// React per frame.

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

// Hydration has finished when React has attached its props to a client
// component's element; the server's HTML has none.
async function hydrated(page: Page) {
  await page.getByRole('button', { name: 'Command palette' }).evaluate(e => new Promise<void>(done => {
    const check = () => (Object.keys(e).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
    check()
  }))
}

test.describe('hydration, every theme × reduced-motion combination', () => {
  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`${theme}, reduced motion ${reduce ? 'on' : 'off'}: the sheet and a drawer deep link`, async ({ page, browser }) => {
        // The combination comes from the system, the way a reader has it,
        // not from ?theme= or ?reduce=: that is the path the inline script
        // resolves before hydration.
        await page.emulateMedia({ colorScheme: theme === 'operate' ? 'dark' : 'light', reducedMotion: reduce ? 'reduce' : 'no-preference' })
        const errors = collectErrors(page)
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', reduce ? '1' : '0')
        await hydrated(page)
        await page.goto('/?dataset=regions&sort=index&dir=desc&range=5Y')
        await hydrated(page)
        expect(errors).toEqual([])
        // A hard load of a drawer URL renders the full page, a second tree.
        const direct = await browser.newPage()
        await direct.emulateMedia({ colorScheme: theme === 'operate' ? 'dark' : 'light', reducedMotion: reduce ? 'reduce' : 'no-preference' })
        const directErrors = collectErrors(direct)
        await direct.goto('/company/ou-tokyo')
        await expect(direct.getByRole('heading', { level: 1 })).toBeVisible()
        await direct.waitForLoadState('networkidle')
        expect(directErrors).toEqual([])
        await direct.close()
      })
    }
  }
})

test.describe('a tick does not render React per frame', () => {
  test('every figure ticks at once on a new snapshot, and React commits a handful of times', async ({ page }) => {
    // React calls the DevTools hook on every commit, production builds
    // included. Installed before any script runs, it counts commits.
    await page.addInitScript(() => {
      const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }
      w.__commits = 0
      w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        isDisabled: false,
        renderers: new Map(),
        inject: () => 1,
        onCommitFiberRoot: () => {
          w.__commits++
        },
        onCommitFiberUnmount: () => {},
        onPostCommitFiberRoot: () => {},
        checkDCE: () => {},
      }
    })
    // The poll's read of the snapshot: every metric of every entity moved,
    // and the snapshot newer, so the sheet takes it.
    let bump = false
    await page.route('**/api/refresh', async route => {
      if (route.request().method() !== 'GET' || !bump) return route.continue()
      const res = await route.fetch()
      const snap = await res.json()
      snap.at = new Date(Date.parse(snap.at) + 60_000).toISOString()
      for (const e of Object.values(snap.entities) as Array<{ metrics: Record<string, { value: number }> }>) {
        for (const m of Object.values(e.metrics)) m.value = m.value * 1.1 + 1
      }
      await route.fulfill({ response: res, json: snap })
    })
    await page.goto('/')
    await hydrated(page)
    // The logos load once, after first paint, and commit as they do: the
    // runtime, the file, the theme's instance, the first draw. Settled
    // before the window opens, so what it counts is the tick's alone.
    for (const logo of await page.locator('[data-riv]').all()) await expect(logo).toHaveAttribute('data-logo', 'animated', { timeout: 15_000 })
    const figure = page.getByRole('button', { name: /^Level for Anchor Kaze/ }).locator('span').first()
    const before = await figure.textContent()

    // Sample the figure's text on every frame from the poll's return, and
    // count commits over the same frames.
    bump = true
    await page.evaluate(() => {
      const w = window as unknown as { __commits: number; frames: { text: string; commits: number }[] }
      w.frames = []
      const el = document.querySelector('[aria-label^="Level for Anchor Kaze"] span')!
      const start = w.__commits
      const tick = () => {
        w.frames.push({ text: el.textContent ?? '', commits: w.__commits - start })
        if (w.frames.length < 90) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      // The sheet reads the snapshot again when the tab becomes visible.
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForFunction(() => (window as unknown as { frames: unknown[] }).frames.length >= 90)
    const frames = await page.evaluate(() => (window as unknown as { frames: { text: string; commits: number }[] }).frames)
    const texts = new Set(frames.map(f => f.text))
    // The tick ran: the figure passed through values between the two ends.
    expect(frames[frames.length - 1]!.text).not.toBe(before)
    expect(texts.size).toBeGreaterThan(4)
    // And React did not follow it: the new snapshot, the series reload,
    // and the announcement are a few commits, not one per frame.
    const commits = frames[frames.length - 1]!.commits
    const ticking = frames.filter((f, i) => i > 0 && f.text !== frames[i - 1]!.text).length
    expect(ticking).toBeGreaterThan(10)
    expect(commits).toBeLessThan(10)
  })
})

test.describe('the theme switch is one crossfade', () => {
  // Before the view transition, the drawer and the chart switched at once,
  // the ledger's bands on fast, the page on base, and the figures on
  // slower (David, 2026-09-28). Now every surface takes its new color in
  // the same frame, and the only motion is the root's crossfade.
  for (const reduce of [false, true]) {
    test(`every surface switches in one frame, inside a crossfade of ${reduce ? '10 ms (reduced motion)' : 'base'}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: reduce ? 'reduce' : 'no-preference' })
      await landEmpty(page, '/')
      await hydrated(page)
      await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
      await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveAttribute('data-drawn')
      await page.getByRole('link', { name: /Keel London/ }).click()
      await expect(page.getByRole('dialog', { name: /Keel London/ })).toBeVisible()
      // Let the drawer's spring settle before sampling.
      await page.waitForTimeout(1000)

      await page.evaluate(() => {
        const w = window as unknown as { frames: Record<string, string>[]; vt: number[] }
        w.frames = []
        w.vt = []
        const probes: Record<string, () => string> = {
          page: () => getComputedStyle(document.body).backgroundColor,
          drawer: () => getComputedStyle(document.querySelector('dialog')!).backgroundColor,
          band: () => getComputedStyle(document.querySelectorAll('tbody tr')[1]!).backgroundColor,
          figure: () => getComputedStyle(document.querySelector('[aria-label^="Level for Anchor Kaze"]')!).color,
          ribbon: () => getComputedStyle(document.querySelector('path[data-series="ou-tokyo"]')!).stroke,
        }
        const tick = () => {
          const f: Record<string, string> = {}
          for (const [k, read] of Object.entries(probes)) f[k] = read()
          w.frames.push(f)
          for (const a of document.getAnimations()) {
            const effect = a.effect as KeyframeEffect | null
            if (effect?.pseudoElement === '::view-transition-new(root)') w.vt.push(Number(effect.getTiming().duration))
          }
          if (w.frames.length < 40) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.getByRole('button', { name: 'Switch to the dark stock' }).click()
      await page.waitForFunction(() => (window as unknown as { frames: unknown[] }).frames.length >= 40)
      const { frames, vt } = await page.evaluate(() => {
        const w = window as unknown as { frames: Record<string, string>[]; vt: number[] }
        return { frames: w.frames, vt: w.vt }
      })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'operate')

      const keys = Object.keys(frames[0]!)
      const firstChange = keys.map(k => frames.findIndex(f => f[k] !== frames[0]![k]))
      // Every surface changed, all in the same frame...
      for (const i of firstChange) expect(i).toBeGreaterThan(0)
      expect(new Set(firstChange).size).toBe(1)
      // ...straight to its new value, with nothing in between.
      for (const k of keys) expect(new Set(frames.map(f => f[k])).size).toBe(2)
      // And the crossfade ran on the token.
      expect(vt.length).toBeGreaterThan(0)
      expect(vt[0]).toBe(reduce ? 10 : 200)
      // The suspension is lifted once it is over.
      await expect(page.locator('html')).not.toHaveAttribute('data-theme-switching')
    })
  }
})
