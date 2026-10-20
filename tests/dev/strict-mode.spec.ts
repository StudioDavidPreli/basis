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

  test('the first row charted is on its window from the first frame', async ({ page }) => {
    await warm(page)
    // On Regions, which lands with nothing charted: Comparables lands with
    // four (decisions/2026-10-15-four-rows-charted-on-landing.md), and this
    // is about the chart's very first ribbon.
    await page.goto('/?dataset=regions')
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(0)
    // Sample the geometry on every frame from the ribbon's arrival: the
    // path's first x, the endpoint's left offset, and the reveal's width.
    // The Strict Mode bug: the chart jumped the domain values after the
    // ribbon, the ticks, and the endpoint had read them, the simulated
    // unmount cancelled the derived values' update, and the whole chart sat
    // on the placeholder window (x around 2e15) for the length of the draw.
    await page.evaluate(() => {
      const w = window as unknown as { samples: { x: number; left: number; width: number }[] }
      w.samples = []
      const box = document.querySelector('svg[preserveAspectRatio="none"]')!.parentElement!
      const observer = new MutationObserver(() => {
        const path = box.querySelector('path[data-series]')
        const endpoint = box.querySelector<HTMLElement>('[data-endpoint]')
        if (!path || !endpoint) return
        observer.disconnect()
        const tick = () => {
          const d = path.getAttribute('d') ?? ''
          const rect = box.querySelector('[data-reveal]')
          w.samples.push({ x: Number(d.slice(1).split(',')[0]), left: parseFloat(endpoint.style.left), width: parseFloat(rect?.getAttribute('width') ?? '') })
          if (w.samples.length < 45) requestAnimationFrame(tick)
        }
        tick()
      })
      observer.observe(box, { childList: true, subtree: true })
    })
    const first = page.locator('tbody input[type="checkbox"]').first()
    await expect(first).toBeEnabled()
    await first.evaluate(el => new Promise<void>(done => {
      const check = () => (Object.keys(el).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
      check()
    }))
    await first.click()
    await expect(page.locator('path[data-series]')).toHaveAttribute('data-drawn')
    const samples = await page.evaluate(() => (window as unknown as { samples: { x: number; left: number; width: number }[] }).samples)
    const full = await page.locator('svg[preserveAspectRatio="none"]').evaluate(el => (el as SVGSVGElement).viewBox.baseVal.width)
    expect(samples.length).toBeGreaterThan(20)
    for (const s of samples) {
      // On the window: the first point of a 1Y window over a series that
      // starts in June sits inside the plot, and the endpoint at its right edge.
      expect(Number.isFinite(s.x)).toBe(true)
      expect(Math.abs(s.x)).toBeLessThan(full * 2)
      expect(s.left).toBeGreaterThan(50)
      expect(s.left).toBeLessThanOrEqual(100)
    }
    // And the reveal ran on it: several frames with the clip mid-way.
    const end = samples[samples.length - 1]!.width
    expect(end).toBeGreaterThan(full * 0.2)
    expect(samples.filter(s => s.width > end * 0.2 && s.width < end * 0.8).length).toBeGreaterThan(3)
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

  test('the palette opens once, enters, and exits, with nothing in the console', async ({ page }) => {
    // The open effect runs twice under Strict Mode; a second showModal() on
    // an open dialog throws. The enter and exit run on the tokens, so the
    // panel is sampled mid-way, not only at its ends.
    const errors = collectErrors(page)
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    const hint = page.getByRole('button', { name: 'Command palette' })
    // The rows are server-rendered; the shortcut's listener exists only
    // once React has hydrated, which a cold dev compile can delay past them.
    await hint.evaluate(e => new Promise<void>(done => {
      const check = () => (Object.keys(e).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
      check()
    }))
    await hint.focus()
    await page.evaluate(() => {
      const w = window as unknown as { opacities: number[] }
      w.opacities = []
      // The dialog mounts on the open; sample from its arrival.
      const observer = new MutationObserver(() => {
        const panel = document.querySelector('dialog[aria-label="Command palette"] > div')
        if (!panel) return
        observer.disconnect()
        const tick = () => {
          w.opacities.push(parseFloat(getComputedStyle(panel).opacity))
          if (w.opacities.length < 40) requestAnimationFrame(tick)
        }
        tick()
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette.getByRole('combobox')).toBeFocused()
    await page.waitForFunction(() => (window as unknown as { opacities: number[] }).opacities.length >= 40)
    const opacities = await page.evaluate(() => (window as unknown as { opacities: number[] }).opacities)
    expect(opacities.some(o => o > 0.05 && o < 0.95)).toBe(true)
    expect(opacities[opacities.length - 1]).toBe(1)
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
    await expect(hint).toBeFocused()
    expect(errors).toEqual([])
  })

  // The drawer's scroll cue decides from the scroll container's numbers on
  // every run of its effect; a decision kept from the first run would be
  // torn down by Strict Mode's cleanup and leave the cue dark or stuck.
  test('the drawer scroll cue shows on open, clears at the bottom, and returns', async ({ page }) => {
    await warm(page)
    await page.goto('/')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    const dialog = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(dialog).toBeVisible()
    const cue = dialog.locator('[data-drawer-scroll-cue]')
    await expect(cue).toHaveAttribute('data-more', 'true')
    await dialog.evaluate(el => el.scrollTo({ top: el.scrollHeight }))
    await expect(cue).not.toHaveAttribute('data-more')
    await dialog.evaluate(el => el.scrollTo({ top: 0 }))
    await expect(cue).toHaveAttribute('data-more', 'true')
    // An entity switch keeps the cue live on the new content.
    await page.getByRole('link', { name: /Keel London/ }).click()
    await expect(page.getByRole('dialog', { name: /Keel London/ }).locator('[data-drawer-scroll-cue]')).toHaveAttribute('data-more', 'true')
  })

  // M9: hydration in every theme × reduced-motion combination. Production
  // reports a mismatch as a minified error number; development names it.
  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`hydrates with nothing in the console: ${theme}, reduced motion ${reduce ? 'on' : 'off'}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme === 'operate' ? 'dark' : 'light', reducedMotion: reduce ? 'reduce' : 'no-preference' })
        const errors = collectErrors(page)
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await page.getByRole('button', { name: 'Command palette' }).evaluate(e => new Promise<void>(done => {
          const check = () => (Object.keys(e).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
          check()
        }))
        await page.goto('/company/ou-tokyo')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.waitForLoadState('networkidle')
        expect(errors).toEqual([])
      })
    }
  }
})

// The welcome opens from a store read after hydration and is shown from its
// element's own state; Strict Mode's second run of either must not open it
// twice, move focus off Close, or leave the page locked once it closes.
test.describe('the welcome under Strict Mode', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('opens once with Close focused, closes cleanly, and nothing reaches the console', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Basis, sourced-data surface' })
    await expect(dialog).toBeVisible()
    await expect(page.locator('dialog[data-welcome]')).toHaveCount(1)
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await expect(dialog).toHaveAttribute('data-placement', /chart|centred/)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden')
    expect(errors).toEqual([])
  })
})

// The ledger bar keeps its previous column beside the current one, set
// while rendering (M12): Strict Mode's double render must not lose the
// "first show" that grows a column's bars, or leave a retracted column
// filled.
test.describe('the ledger bar under Strict Mode', () => {
  test('grows on a sort, moves with it, and nothing reaches the console', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    const filled = (col: string) =>
      page.evaluate(col => {
        const i = [...document.querySelectorAll('thead th')].findIndex(th => th.textContent?.includes(col))
        return [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter(tr => {
          const halves = [...tr.cells[i]!.querySelectorAll('[data-bar] > span')].slice(-2)
          return halves.some(h => h.getBoundingClientRect().width > 1)
        }).length
      }, col)
    const click = (col: string) => page.evaluate(col => ([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith(col)) as HTMLButtonElement).click(), col)
    await click('Level')
    await expect.poll(() => filled('Level')).toBe(12)
    await click('Δ 1d')
    await expect.poll(() => filled('Δ 1d')).toBeGreaterThan(0)
    await expect.poll(() => filled('Level')).toBe(0)
    // A kept column holds its bars through the next sort.
    await page.getByRole('checkbox', { name: 'Keep bars on Δ 1d' }).check()
    await click('EV/EBITDA')
    await expect.poll(() => filled('EV/EBITDA')).toBe(12)
    expect(await filled('Δ 1d')).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })
})

// A metric switch makes the domain new while rendering and remounts the
// ribbons in a group keyed by the metric (decisions/2026-10-19-a-metric-
// switch-redraws.md). Under Strict Mode's double run the arriving ribbons
// must still draw in from the left, on the new domain, and land drawn.
test.describe('the metric switch under Strict Mode', () => {
  test('redraws from the left on the new domain, with nothing in the console', async ({ page }) => {
    const errors = collectErrors(page)
    // Framer warns, not errors, when an exit has nothing to fade from.
    page.on('console', m => {
      if (m.type() === 'warning' && /not an animatable value/.test(m.text())) errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const seen = await page.evaluate(async () => {
      const chip = [...document.querySelectorAll('[aria-label="Metric"] button')].find(b => b.textContent?.trim() === 'Δ 1d') as HTMLButtonElement
      const svg = document.querySelector('svg path[data-series]')!.closest('svg')!
      let past = 0
      const clips: number[] = []
      chip.click()
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const box = svg.getBoundingClientRect()
        for (const p of svg.querySelectorAll('path[data-series]')) {
          const b = p.getBoundingClientRect()
          past = Math.max(past, box.top - b.top, b.bottom - box.bottom)
          const id = p.getAttribute('clip-path')?.match(/url\(#(.+)\)/)?.[1]
          const rect = id ? document.getElementById(id)?.firstElementChild : null
          if (rect) clips.push(parseFloat(rect.getAttribute('width') ?? '0') / box.width)
        }
      }
      return { past: Math.round(past), minClip: clips.length ? Math.min(...clips) : null }
    })
    expect(seen.past).toBeLessThanOrEqual(2)
    expect(seen.minClip).not.toBeNull()
    expect(seen.minClip!).toBeLessThan(0.5)
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await expect(page.locator('path[data-series]')).toHaveCount(4)
    expect(errors).toEqual([])
  })
})

// The hero's views keep the previous view beside the current one, set while
// rendering, and share each charted marker between the line's endpoint and
// its Risk / return point (decisions/2026-10-19-views-in-the-hero.md). Under
// Strict Mode's double run the marker must still travel and land, both ways.
test.describe('the hero views under Strict Mode', () => {
  test('a marker travels to Risk / return and back, with nothing in the console', async ({ page }) => {
    const errors = collectErrors(page)
    page.on('console', m => {
      if (m.type() === 'warning' && /not an animatable value/.test(m.text())) errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    for (const to of ['Risk / return', 'Over time']) {
      const moved = await page.evaluate(async to => {
        const btn = [...document.querySelectorAll('[aria-label="Chart view"] button')].find(b => b.textContent?.includes(to)) as HTMLButtonElement
        const at = () => document.querySelector('[data-point="ou-tokyo"] [data-mark], [data-endpoint="ou-tokyo"] > span')?.getBoundingClientRect().left ?? null
        const xs = [at()]
        btn.click()
        for (let i = 0; i < 70; i++) {
          await new Promise(r => requestAnimationFrame(r))
          xs.push(at())
        }
        const seen = xs.filter((x): x is number => x !== null)
        return { distinct: new Set(seen.map(Math.round)).size, travel: Math.abs(seen[seen.length - 1]! - seen[0]!) }
      }, to)
      expect(moved.travel, to).toBeGreaterThan(40)
      expect(moved.distinct, to).toBeGreaterThan(5)
    }
    await expect(page.locator('[data-endpoint]')).toHaveCount(4)
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    expect(errors).toEqual([])
  })
})

// Heat keeps its tab stop and cursor in state and remounts a grid per bucket
// size; a pick is one reducer action (decisions/2026-10-19-heat-measures-
// moves-in-sigma.md). Under Strict Mode the grid must reveal whole, and a
// pick must chart its row and land on Over time.
test.describe('Heat under Strict Mode', () => {
  test('reveals whole, picks a cell into Over time, with nothing in the console', async ({ page }) => {
    const errors = collectErrors(page)
    page.on('console', m => {
      if (m.type() === 'warning' && /not an animatable value/.test(m.text())) errors.push(m.text())
    })
    await page.goto('/?view=heat')
    await expect(page.locator('[data-cell][tabindex="0"]')).toHaveCount(1)
    // Uncovered whole: the cover's scale runs to nothing.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const t = getComputedStyle(document.querySelector('[data-reveal-cover]')!).transform
          return t === 'none' ? 1 : Math.abs(Number(t.match(/matrix\(([^,]+)/)![1]))
        }),
      )
      .toBeLessThan(0.001)
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    await expect(page.locator('[data-heat]')).toHaveCount(1)
    await expect(page.locator('[data-heat]')).toHaveAttribute('data-unit', 'day')
    const cell = page.locator('[data-cell]').nth(40)
    const id = (await cell.getAttribute('data-cell'))!.split(':')[0]
    await cell.click()
    await expect(page.locator(`path[data-series="${id}"][data-drawn]`)).toHaveCount(1)
    expect(errors).toEqual([])
  })
})

// The fan animates its clip open from wherever it is, in an effect, and
// closes through presence (decisions/2026-10-19-the-projection-runs-the-
// config-forward.md). Under Strict Mode's double run it must open whole,
// and close and leave, with nothing in the console.
test.describe('the projection fan under Strict Mode', () => {
  test('opens whole and closes away, with nothing in the console', async ({ page }) => {
    const errors = collectErrors(page)
    page.on('console', m => {
      if (m.type() === 'warning' && /not an animatable value/.test(m.text())) errors.push(m.text())
    })
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await page.getByRole('checkbox', { name: /Projection/ }).check()
    await expect(page.locator('[data-fan]')).toHaveCount(4)
    // Open whole: the reveal reaches the fan's own span.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = document.querySelector('[data-fan-reveal]')!
          return parseFloat(r.getAttribute('width') ?? '0')
        }),
      )
      .toBeGreaterThan(100)
    await page.getByRole('checkbox', { name: /Projection/ }).uncheck()
    await expect(page.locator('[data-fan]')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
