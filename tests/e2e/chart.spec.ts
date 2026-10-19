import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { landEmpty } from './land'

// M6 acceptance on the Worker runtime, fixtures mode: toggling a row draws
// or removes its ribbon; a range change animates the domain; keyboard focus
// on a row reads the point; axe clean with ribbons drawn; reduced motion
// makes both instant.

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

const plot = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Chart' }).getByRole('img', { name: /rows?|No rows/ })

test.describe('the chart', () => {
  test('toggling a row draws its ribbon, its endpoint, and its legend entry; toggling again removes them', async ({ page }) => {
    await landEmpty(page, '/')
    await expect(plot(page)).toHaveAttribute('aria-label', /^No rows charted/)
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    const ribbon = page.locator('path[data-series="ou-tokyo"]')
    await expect(ribbon).toHaveCount(1)
    // A real path over real dates: many segments, drawn in on slower / enter.
    expect((await ribbon.getAttribute('d'))!.split('L').length).toBeGreaterThan(20)
    await expect(ribbon).toHaveAttribute('data-drawn')
    // Drawn and staying, the ribbon is unclipped, so a re-measure of the
    // frame after the drawer's spring never clips it.
    await expect(ribbon).not.toHaveAttribute('clip-path')
    await expect(page.locator('[data-endpoint="ou-tokyo"]')).toBeVisible()
    await expect(plot(page)).toHaveAttribute('aria-label', /^Level over 3M, 1 row: Anchor Kaze [\d.,]+\. History from 2026-06-01\. Values from \d{4}-\d{2}-\d{2} are provisional\. The table below is the accessible alternative\.$/)
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await expect(ribbon).toHaveCount(0)
    await expect(page.locator('[data-endpoint="ou-tokyo"]')).toHaveCount(0)
    await expect(plot(page)).toHaveAttribute('aria-label', /^No rows charted/)
  })

  test('the draw-in is a reveal across the plot, visible mid-way', async ({ page }) => {
    await landEmpty(page, '/')
    // Sample the clip rectangle's width on every frame from the ribbon's
    // arrival. The stroke drawn along the path's length that this replaced
    // spent most of `slower` on history the window clips, and the visible
    // part arrived in the last 150 ms; the built-output gate could not see
    // that because it only waited for `data-drawn`.
    await page.evaluate(() => {
      const w = window as unknown as { samples: { width: number; clipped: boolean }[] }
      w.samples = []
      const svg = document.querySelector('svg[preserveAspectRatio="none"]')!
      const observer = new MutationObserver(() => {
        const rect = svg.querySelector('[data-reveal]')
        const path = svg.querySelector('path[data-series]')
        if (!rect || !path) return
        observer.disconnect()
        const tick = () => {
          w.samples.push({ width: parseFloat(rect.getAttribute('width') ?? ''), clipped: path.hasAttribute('clip-path') })
          if (w.samples.length < 60) requestAnimationFrame(tick)
        }
        tick()
      })
      observer.observe(svg, { childList: true, subtree: true })
    })
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveAttribute('data-drawn')
    await page.waitForTimeout(400)
    const samples = await page.evaluate(() => (window as unknown as { samples: { width: number; clipped: boolean }[] }).samples)
    const widths = samples.map(s => s.width)
    const full = widths[widths.length - 1]!
    const plot = await page.locator('svg[preserveAspectRatio="none"]').evaluate(el => (el as SVGSVGElement).viewBox.baseVal.width)
    // Starts closed, ends across the ribbon's visible extent (the fixtures'
    // history is three months of a 1Y window), and passes through the
    // middle over several frames rather than jumping there.
    expect(full).toBeGreaterThan(plot * 0.2)
    expect(widths[0]).toBeLessThan(full * 0.2)
    expect(widths.filter(x => x > full * 0.2 && x < full * 0.8).length).toBeGreaterThan(3)
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!)
    // Clipped while revealing, unclipped once drawn.
    expect(samples[0]!.clipped).toBe(true)
    expect(samples[samples.length - 1]!.clipped).toBe(false)
  })

  test('the legend removes a ribbon, and the ninth selected row waits', async ({ page }) => {
    await landEmpty(page, '/')
    await page.getByRole('checkbox', { name: 'Select all rows' }).click()
    await expect(page.locator('path[data-series]')).toHaveCount(8)
    await expect(page.getByRole('list', { name: 'Selected rows' })).toContainText('4 more selected, not charted')
    await page.getByRole('button', { name: 'Remove Anchor Kaze from the chart' }).click()
    await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveCount(0)
    await expect(page.locator('path[data-series]')).toHaveCount(8)
  })

  test('a range change animates the domain and lands on the new window', async ({ page }) => {
    await landEmpty(page, '/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    const ribbon = page.locator('path[data-series="ou-tokyo"]')
    await expect(ribbon).toHaveAttribute('data-drawn')
    const svg = page.locator('svg[preserveAspectRatio="none"]')
    const before = await ribbon.getAttribute('d')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    // The rescale is in flight (slow / standard), then settles.
    await expect(svg).toHaveAttribute('data-animating', '')
    await expect(svg).not.toHaveAttribute('data-animating', '')
    const after = await ribbon.getAttribute('d')
    expect(after).not.toBe(before)
    await expect(plot(page)).toHaveAttribute('aria-label', /Level over 1M/)
    await expect(page).toHaveURL('/?range=1M')
    // Mid-flight the path is neither the old nor the new one.
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: 'Max' }).click()
    await expect(svg).toHaveAttribute('data-animating', '')
    // The flag is set before the first frame moves; sample a few frames in.
    await page.waitForTimeout(120)
    const mid = await ribbon.getAttribute('d')
    await expect(svg).not.toHaveAttribute('data-animating', '')
    const final = await ribbon.getAttribute('d')
    expect(mid).not.toBe(after)
    expect(mid).not.toBe(final)
  })

  // A metric switch redraws (decisions/2026-10-19-a-metric-switch-redraws.md):
  // until then the new metric's values were drawn on the old domain for a
  // frame, a line thousands of pixels past the plot, and collapsed in.
  // Sampled per frame: no ribbon ever leaves the plot vertically, the
  // arriving ribbons draw in from the left, and four are left, drawn.
  async function switchFrames(page: import('@playwright/test').Page, metric: string) {
    return page.evaluate(async metric => {
      const chip = [...document.querySelectorAll('[aria-label="Metric"] button')].find(b => b.textContent?.trim() === metric) as HTMLButtonElement
      const svg = document.querySelector('svg path[data-series]')!.closest('svg')!
      const frames: { past: number; clips: number[] }[] = []
      chip.click()
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const box = svg.getBoundingClientRect()
        const paths = [...svg.querySelectorAll('path[data-series]')]
        const past = Math.max(0, ...paths.map(p => {
          const b = p.getBoundingClientRect()
          return Math.max(box.top - b.top, b.bottom - box.bottom)
        }))
        const clips = paths.flatMap(p => {
          const id = p.getAttribute('clip-path')?.match(/url\(#(.+)\)/)?.[1]
          const rect = id ? document.getElementById(id)?.firstElementChild : null
          return rect ? [parseFloat(rect.getAttribute('width') ?? '0') / box.width] : []
        })
        frames.push({ past: Math.round(past), clips })
      }
      return { frames, drawn: document.querySelectorAll('path[data-series][data-drawn]').length, total: document.querySelectorAll('path[data-series]').length }
    }, metric)
  }

  test('a metric switch redraws: no line leaves the plot, and the lines draw in from the left', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    for (const metric of ['Δ 1d', 'EV/EBITDA', 'Level']) {
      const { frames, drawn, total } = await switchFrames(page, metric)
      expect(Math.max(...frames.map(f => f.past)), metric).toBeLessThanOrEqual(2)
      const clips = frames.flatMap(f => f.clips)
      expect(clips.length, metric).toBeGreaterThan(0)
      expect(Math.min(...clips), metric).toBeLessThan(0.5)
      expect(drawn, metric).toBe(4)
      expect(total, metric).toBe(4)
    }
  })

  test('a range change within one metric still rescales, and redraws nothing', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    await page.waitForTimeout(50)
    await expect(page.locator('path[data-series]')).toHaveCount(4)
    expect(await page.locator('path[data-series]:not([data-drawn])').count()).toBe(0)
  })

  test('keyboard focus on a row reads its point, and lifts its ribbon', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
    const readout = page.getByTestId('chart-readout')
    // Focus moves to another row's checkbox: the readout reads that row.
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).focus()
    await expect(readout).toContainText('Anchor Kaze')
    const figure = (await page.getByRole('button', { name: /^Level for Anchor Kaze/ }).getAttribute('aria-label'))!
    const value = figure.match(/: ([\d.,()−]+),/)![1]!
    await expect(readout).toContainText(value)
    // The point's date is the run's today (the preview runs on the clock).
    await expect(readout).toContainText(/\d{4}-\d{2}-\d{2}/)
    await expect(readout).toHaveAttribute('role', 'status')
    await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveAttribute('data-hover')
    await expect(page.locator('path[data-series="ou-london"]')).not.toHaveAttribute('data-hover')
    // A row that is not charted still reads.
    await page.getByRole('checkbox', { name: 'Chart Plumb Varsha' }).focus()
    await expect(readout).toContainText('Plumb Varsha')
    // Focus leaving the ledger clears it.
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1Y' }).focus()
    await expect(readout).toBeEmpty()
  })

  test('hovering a ribbon marks its row, and the drawer mutes the others', async ({ page }) => {
    await landEmpty(page, '/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
    await expect(page.locator('path[data-series="ou-london"]')).toHaveAttribute('data-drawn')
    // The pointer on the ribbon itself, at its last point, where the two
    // ribbons are well apart (the fixtures' two series cross often along
    // the way, and on a crossing the nearer line is a coin toss).
    const spot = (await page.locator('[data-endpoint="ou-london"]').boundingBox())!
    await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2)
    await expect(page.locator('tbody tr').filter({ hasText: 'Keel London' })).toHaveAttribute('data-hover')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await expect(page.locator('path[data-series="ou-london"]')).toHaveAttribute('data-muted')
    await expect(page.locator('path[data-series="ou-tokyo"]')).not.toHaveAttribute('data-muted')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('path[data-series="ou-london"]')).not.toHaveAttribute('data-muted')
  })

  test('the pointer in the plot raises a card on the nearest point, a dot on every ribbon, and a rule', async ({ page }) => {
    // Max, so the fixtures' three months fill the window and the card's
    // side can be judged by where the pointer is.
    await landEmpty(page, '/?range=Max')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(2)
    const card = page.getByTestId('chart-card')
    // On the endpoint: the card carries the ledger's own figure, since the
    // refresh wrote it as the series' last point, dated today, inside the
    // provisional band.
    const endpoint = (await page.locator('[data-endpoint="ou-tokyo"]').boundingBox())!
    await page.mouse.move(endpoint.x + endpoint.width / 2, endpoint.y + endpoint.height / 2)
    await expect(card).toBeVisible()
    await expect(card).toContainText('Anchor Kaze')
    const figure = (await page.getByRole('button', { name: /^Level for Anchor Kaze/ }).getAttribute('aria-label'))!
    await expect(card).toContainText(figure.match(/: ([\d.,()−]+),/)![1]!)
    await expect(card).toContainText(/\d{4}-\d{2}-\d{2} · provisional/)
    await expect(card).toHaveAttribute('data-side', 'left')
    await expect(page.locator('[data-cursor-dot]')).toHaveCount(2)
    await expect(page.locator('[data-cursor-layer]')).toHaveCount(1)
    // The anchor is the hovered row, and the readout steps aside for the card.
    await expect(page.locator('tbody tr').filter({ hasText: 'Anchor Kaze' })).toHaveAttribute('data-hover')
    await expect(page.locator('path[data-series="ou-tokyo"]')).toHaveAttribute('data-hover')
    await expect(page.getByTestId('chart-readout')).toBeHidden()
    // In the left quarter of the plot the card sits to the right of its point.
    const box = (await page.locator('svg[preserveAspectRatio="none"]').boundingBox())!
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
    await expect(card).toHaveAttribute('data-side', 'right')
    await expect(card).toContainText(/\d{4}-\d{2}-\d{2}/)
    await expect(card).not.toContainText('provisional')
    // Leaving the plot takes the cursor and the hover with it.
    await page.mouse.move(box.x + box.width / 2, box.y - 40)
    await expect(card).toHaveCount(0)
    await expect(page.locator('tbody tr').filter({ hasText: 'Anchor Kaze' })).not.toHaveAttribute('data-hover')
  })

  test('the regions dataset charts on its own series, read after the switch', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Regions' }).click()
    await page.getByRole('checkbox', { name: 'Chart Brooklyn' }).click()
    const ribbon = page.locator('path[data-series="brooklyn"]')
    await expect(ribbon).toHaveAttribute('data-drawn')
    await expect(plot(page)).toHaveAttribute('aria-label', /^Index over 3M, 1 row: Brooklyn/)
  })

  test('the other dataset reads its series again once the snapshot has advanced', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(8)
    await page.getByRole('button', { name: 'Comparables' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(12)
    // A manual refresh advances the snapshot; the poll takes the same path.
    // `exact`, because while the run is in flight every figure's own label
    // ends in ", refreshing" and a loose name matches all 36 of them. The
    // header button is `Refreshing` for the same window, so waiting for
    // `Refresh` to exist again is waiting for the run to land.
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
    // The regions series on hand are from before the run and are forgotten;
    // the switch reads them again, so the endpoints match the figures.
    const read = page.waitForRequest(r => r.url().includes('/api/series?dataset=regions'), { timeout: 5_000 })
    await page.getByRole('button', { name: 'Regions' }).click()
    await read
  })

  test('passes axe with ribbons drawn, the readout up, and the drawer open', async ({ page }) => {
    await landEmpty(page, '/')
    await page.getByRole('checkbox', { name: 'Select all rows' }).click()
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(8)
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).focus()
    await expect(page.getByTestId('chart-readout')).toContainText('Anchor Kaze')
    await page.screenshot({ path: 'test-results/chart-eight.png' })
    let results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
    // With the cursor up.
    const endpoint = (await page.locator('[data-endpoint="ou-tokyo"]').boundingBox())!
    await page.mouse.move(endpoint.x + endpoint.width / 2, endpoint.y + endpoint.height / 2)
    await expect(page.getByTestId('chart-card')).toBeVisible()
    // Landed, not mid-enter: axe reads contrast through the layer's opacity.
    await expect(page.locator('[data-cursor-layer]')).toHaveCSS('opacity', '1')
    results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    // The click took the pointer out of the plot, so the cursor is on its
    // way out; axe reads the card's contrast through the fade unless the
    // exit has landed.
    await expect(page.getByTestId('chart-card')).toHaveCount(0)
    results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('a rescale cut short by a clear leaves no animating flag behind', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    await page.getByRole('checkbox', { name: 'Chart Keel London' }).click()
    const svg = page.locator('svg[preserveAspectRatio="none"]')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    await expect(svg).toHaveAttribute('data-animating', '')
    // A stopped animation never resolves; the cleanup owns the flag.
    await page.getByRole('button', { name: '[ Clear ]' }).click()
    await expect.poll(async () => (await svg.getAttribute('data-animating')) === null, { timeout: 250 }).toBe(true)
  })

  test('under reduced motion a metric switch lands at once', async ({ page }) => {
    await page.goto('/?reduce=1')
    await expect(page.locator('path[data-series][data-drawn]')).toHaveCount(4)
    const { frames } = await switchFrames(page, 'Δ 1d')
    expect(Math.max(...frames.map(f => f.past))).toBeLessThanOrEqual(2)
    // Ten frames in, the old lines are gone and the new ones drawn.
    expect(frames.slice(10).every(f => f.clips.length === 0)).toBe(true)
    await expect(page.locator('path[data-series]')).toHaveCount(4)
  })

  test('under reduced motion the draw-in and the rescale are instant', async ({ page }) => {
    await landEmpty(page, '/?reduce=1')
    await page.getByRole('checkbox', { name: 'Chart Anchor Kaze' }).click()
    const ribbon = page.locator('path[data-series="ou-tokyo"]')
    // The draw-in is slower (600 ms) with motion; here it is done at once.
    await expect(ribbon).toHaveAttribute('data-drawn', { timeout: 250 })
    const svg = page.locator('svg[preserveAspectRatio="none"]')
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '1M' }).click()
    // The rescale is slow (400 ms) with motion; here it has settled at once.
    await expect.poll(async () => (await svg.getAttribute('data-animating')) === null, { timeout: 250 }).toBe(true)
    await expect(plot(page)).toHaveAttribute('aria-label', /Level over 1M/)
  })
})

// The chart as a CSV (decisions/2026-10-15-export-the-chart-as-csv.md).
test.describe('export', () => {
  test('downloads what the chart shows, with provenance above the header', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('path[data-series]')).toHaveCount(4)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^Export the chart as CSV/ }).click()])
    expect(download.suggestedFilename()).toMatch(/^basis-level-3M-\d{4}-\d{2}-\d{2}\.csv$/)
    const csv = (await import('node:fs')).readFileSync((await download.path())!, 'utf8')
    const lines = csv.trimEnd().split('\n')
    const comments = lines.filter(l => l.startsWith('#'))
    const table = lines.filter(l => !l.startsWith('#'))
    expect(comments[0]).toMatch(/^# Basis · Level over 3M, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/)
    for (const name of ['Anchor Kaze', 'Plumb Varsha', 'Windward Sydney', 'Ember Shamal']) {
      expect(comments.some(c => c.startsWith(`# ${name}, latest figure: `))).toBe(true)
    }
    expect(comments).toContain('# Companies and regions are simulated; their drivers are real.')
    expect(table[0]).toBe('date,Anchor Kaze,Plumb Varsha,Windward Sydney,Ember Shamal,provisional')
    // The view range: no more than 3M of dates, and every line has every column.
    const dates = table.slice(1).map(l => l.split(',')[0]!)
    expect(dates.length).toBeGreaterThan(20)
    expect(Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)).toBeLessThanOrEqual(91 * 86_400_000)
    for (const l of table.slice(1)) expect(l.split(',')).toHaveLength(6)
  })

  test('is absent while nothing is charted', async ({ page }) => {
    await landEmpty(page, '/')
    await expect(page.getByRole('button', { name: /^Export the chart as CSV/ })).toHaveCount(0)
  })
})
