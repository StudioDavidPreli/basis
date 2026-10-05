import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// M4 acceptance on the Worker runtime, fixtures mode: sort via keyboard with
// aria-sort updating, Shift-range select, the provenance popover on hover
// and on click with Escape returning focus, the interruption banner at all
// three levels from fixtures, every status screenshotted, axe clean.

test.beforeEach(async ({ request }) => {
  // A clean, complete snapshot before every test.
  await request.post('/api/refresh')
})

test.describe('the ledger', () => {
  test('renders twelve numbered rows with sourced figures and passes axe', async ({ page }) => {
    await page.goto('/')
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(12)
    await expect(rows.first()).toContainText('01')
    await expect(page.getByRole('rowheader', { name: /Anchor Kaze/ })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })

  test('sorts via keyboard and aria-sort follows', async ({ page }) => {
    await page.goto('/')
    const header = page.getByRole('columnheader', { name: /Level/ })
    await expect(header).toHaveAttribute('aria-sort', 'none')
    await header.getByRole('button').focus()
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    const first = await page.locator('tbody tr').first().getByRole('rowheader').textContent()
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    const firstDesc = await page.locator('tbody tr').first().getByRole('rowheader').textContent()
    expect(firstDesc).not.toBe(first)
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'none')
    await expect(page.getByTestId('live-region')).toContainText(/Sorted by Level/)
  })

  test('sorts by name alphabetically, both ways', async ({ page }) => {
    await page.goto('/')
    const names = async () => (await page.locator('tbody th[scope="row"] a').allTextContents()).map(t => t.trim())
    const file = await names()
    const sorted = [...file].sort((a, b) => a.localeCompare(b))
    expect(file).not.toEqual(sorted)
    const header = page.getByRole('columnheader', { name: /Name/ })
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect.poll(names).toEqual(sorted)
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect.poll(names).toEqual([...sorted].reverse())
    await expect(page).toHaveURL('/?sort=name&dir=desc')
  })

  test('Shift-range selects a run of rows and the legend lists them', async ({ page }) => {
    await page.goto('/')
    const boxes = page.locator('tbody input[type="checkbox"]')
    await boxes.nth(1).click()
    await boxes.nth(4).click({ modifiers: ['Shift'] })
    for (const i of [1, 2, 3, 4]) await expect(boxes.nth(i)).toBeChecked()
    await expect(boxes.nth(0)).not.toBeChecked()
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('listitem')).toHaveCount(5) // four rows + clear
    const headerBox = page.locator('thead input[type="checkbox"]')
    expect(await headerBox.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true)
  })

  test('select-all takes every row; the chart holds eight and the legend says so', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('checkbox', { name: 'Select all rows' }).click()
    await expect(page.locator('tbody input[type="checkbox"]:checked')).toHaveCount(12)
    const legend = page.getByRole('list', { name: 'Selected rows' })
    await expect(legend).toContainText('4 more selected, not charted')
    await expect(legend.getByRole('button', { name: /Remove/ })).toHaveCount(8)
  })

  test('the sun/moon toggle swaps the stock and remembers it', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'passbook')
    await page.getByRole('button', { name: 'Switch to the dark stock' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'operate')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'operate')
    await page.getByRole('button', { name: 'Switch to the light stock' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'passbook')
  })

  test('the provenance popover: tooltip on hover, dialog on click, Escape returns focus', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    await trigger.hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('Open-Meteo')
    await expect(tip.getByRole('link', { name: /open the request/ }).first()).toHaveAttribute('href', /open-meteo/)
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Provenance' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('the provenance dialog keeps focus where the reader put it', async ({ page }) => {
    // The focus-into-dialog effect once shared its dependency list with
    // the Escape listener's, which the Figure re-creates on every render;
    // a hover on the trigger pulled focus back from the Close button.
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Provenance' })
    await expect(dialog).toBeFocused()
    const close = dialog.getByRole('button', { name: 'Close provenance' })
    await close.focus()
    await expect(close).toBeFocused()
    await trigger.hover()
    await page.mouse.move(0, 0)
    await expect(close).toBeFocused()
    await close.click()
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('the URL mirror keeps the reduce override through a sort and a reload', async ({ page }) => {
    await page.goto('/?reduce=1')
    await page.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await expect(page).toHaveURL(/reduce=1/)
    await expect(page).toHaveURL(/sort=level/)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '1')
    await expect(page.getByRole('columnheader', { name: /Level/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  // M7: the name cell's mark is a CompanyLogo now, and until the artboards
  // land it is the same Marker it has drawn since M2, wrapped in a
  // display:contents span that is not in the layout. Ids are generated, so
  // this asks the page what they are rather than naming one.
  test('the name cell mark is decorative, and a region has no artboard', async ({ page }) => {
    await page.goto('/')
    const mark = page.getByRole('rowheader').first().locator('[data-entity]')
    await expect(mark).toHaveAttribute('aria-hidden', 'true')
    await expect(mark).toHaveAttribute('data-artboard', 'true')
    await expect(mark).toHaveAttribute('data-entity', /.+/)
    await expect(mark.locator('svg')).toHaveCount(1)
    // display: contents — the svg, not the wrapper, is the link's flex child,
    // which is why nothing moved when the wrapper arrived.
    expect(await mark.evaluate(el => getComputedStyle(el).display)).toBe('contents')
    // The row's accessible name is still the entity's, once: the mark is
    // hidden and adds nothing to it.
    await expect(page.getByRole('rowheader', { name: /Anchor Kaze/ })).toHaveCount(1)

    // logos.riv holds one artboard per company. A region is in no artboard's
    // scope and keeps its Marker for good.
    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(8)
    const regionMark = page.getByRole('rowheader').first().locator('[data-entity]')
    await expect(regionMark.locator('svg')).toHaveCount(1)
    expect(await regionMark.getAttribute('data-artboard')).toBeNull()
  })

  test('switching dataset shows the eight regions', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(8)
    await expect(page.getByRole('rowheader', { name: /Brooklyn/ })).toBeVisible()
  })
})

test.describe('every status has a screenshot', () => {
  for (const status of ['current', 'stale', 'refreshing', 'agent-updated', 'unverified']) {
    test(status, async ({ page }) => {
      await page.goto(`/embed/figure?status=${status}`)
      const figure = page.locator('[data-status]').first()
      await expect(figure).toHaveAttribute('data-status', status)
      await page.waitForTimeout(700)
      await page.screenshot({ path: `test-results/status-${status}.png` })
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }
})

test.describe('the interruption banner, from fixtures', () => {
  test('one source failing', async ({ page, request }) => {
    await request.post('/api/refresh?fail=noaa-coops')
    await page.goto('/')
    const banner = page.getByRole('status')
    await expect(banner).toContainText('NOAA CO-OPS is not answering')
    await expect(banner).toContainText('HTTP 503')
    await page.screenshot({ path: 'test-results/banner-source.png' })
  })

  test('every source failing', async ({ page, request }) => {
    await request.post('/api/refresh?fail=all')
    await page.goto('/')
    await expect(page.getByRole('status')).toContainText('No source is answering')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.screenshot({ path: 'test-results/banner-all.png' })
  })

  test('the handler throwing', async ({ page, request }) => {
    const res = await request.post('/api/refresh?fail=handler')
    expect(res.status()).toBe(500)
    await page.goto('/')
    await expect(page.getByRole('status')).toContainText('The last refresh failed')
    await page.screenshot({ path: 'test-results/banner-handler.png' })
  })

  test('a clean run clears the banner', async ({ page, request }) => {
    await request.post('/api/refresh?fail=all')
    await request.post('/api/refresh')
    await page.goto('/')
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})

// The reorder on sort is the ledger's layout animation (contract: slow /
// standard, a short stagger). From 2026-09-16 to 2026-10-05 it never ran:
// layout was switched on only in the render that moved the row, so Framer
// had no earlier position to animate from (David, 2026-10-05, in Safari on
// the table-sort embed). A row is tracked frame by frame through a sort.
async function reorderFrames(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const btn = [...document.querySelectorAll('thead button')].find(b => b.textContent?.includes('Level'))!
    const track = document.querySelectorAll('tbody tr')[5]!
    const y0 = track.getBoundingClientRect().top
    const ys: number[] = []
    ;(btn as HTMLButtonElement).click()
    for (let i = 0; i < 90; i++) {
      await new Promise(r => requestAnimationFrame(r))
      ys.push(Math.round(track.getBoundingClientRect().top - y0))
    }
    const end = ys[ys.length - 1]!
    return { travel: end, between: ys.filter(y => y !== 0 && y !== end).length }
  })
}

test.describe('the row reorder on sort', () => {
  for (const path of ['/', '/embed/table-sort', '/embed/table-sort?preset=cinematic']) {
    test(`rows travel to their new places on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('tbody tr')).toHaveCount(12)
      await page.waitForTimeout(500)
      const { travel, between } = await reorderFrames(page)
      expect(travel).not.toBe(0)
      expect(between).toBeGreaterThan(5)
    })
  }

  test('a sort keeps the page where it was scrolled', async ({ page }) => {
    // WebKit moved the scroll toward the top on every sort (David,
    // 2026-10-05); this runs in the webkit project too.
    await page.setViewportSize({ width: 1280, height: 600 })
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    for (const col of ['Level', 'Level', 'Δ 1d', 'Name']) {
      await page.evaluate(() => scrollTo(0, Math.min(500, document.documentElement.scrollHeight - innerHeight)))
      await page.waitForTimeout(200)
      const before = await page.evaluate(() => Math.round(scrollY))
      expect(before).toBeGreaterThan(100)
      const after = await page.evaluate(async col => {
        ;([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith(col)) as HTMLButtonElement).click()
        for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r))
        return Math.round(scrollY)
      }, col)
      expect(after, col).toBe(before)
    }
  })

  test('under reduced motion the rows land at once', async ({ page }) => {
    await page.goto('/?reduce=1')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.waitForTimeout(500)
    const { travel, between } = await reorderFrames(page)
    expect(travel).not.toBe(0)
    expect(between).toBeLessThanOrEqual(1)
  })

  test('opening the drawer moves no row on its own', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    // While the spring resizes the sheet no row carries a layout transform.
    const transformed = await page.evaluate(async () => {
      let max = 0
      for (let i = 0; i < 40; i++) {
        await new Promise(r => requestAnimationFrame(r))
        max = Math.max(max, [...document.querySelectorAll('tbody tr')].filter(tr => (tr as HTMLElement).style.transform && (tr as HTMLElement).style.transform !== 'none').length)
      }
      return max
    })
    expect(transformed).toBe(0)
  })
})

// The bands are the rows' own (contract: "Rows are opaque, and stack by
// name"). Every row is opaque, so a row crossing another covers it; rows
// stack alphabetically; the levels stay inside the body, under the header
// and the drawer; and the sort runs at frame rate.
test.describe('the bands and the row stack', () => {
  test('every row is opaque, the bands are the even rows, and a sort stacks the shortest move on top', async ({ page }) => {
    await page.goto('/embed/table-sort')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    const names = () => page.evaluate(() => [...document.querySelectorAll('tbody tr th .type-label')].map(e => e.textContent!))
    const before = await names()
    await page.getByRole('columnheader', { name: /Level/ }).getByRole('button').click()
    await expect(page.getByRole('columnheader', { name: /Level/ })).toHaveAttribute('aria-sort', 'ascending')
    // Let the reorder and the band fade on rows that changed parity settle.
    await page.waitForTimeout(1500)
    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('tbody tr')]
      return {
        fills: rows.map(tr => getComputedStyle(tr).backgroundColor),
        names: rows.map(tr => tr.querySelector('th .type-label')!.textContent!),
        levels: rows.map(tr => Number(getComputedStyle(tr).zIndex)),
        isolated: getComputedStyle(document.querySelector('tbody')!).isolation,
      }
    })
    for (const f of r.fills) expect(f).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(new Set(r.fills.filter((_, k) => k % 2 === 1)).size).toBe(1)
    expect(r.fills[1]).not.toBe(r.fills[0])
    // The shorter a row's move, the higher it stacks.
    const moves = r.names.map((name, i) => ({ distance: Math.abs(i - before.indexOf(name)), level: r.levels[i]! }))
    for (const a of moves) for (const b of moves) if (a.distance < b.distance) expect(a.level).toBeGreaterThan(b.level)
    expect(r.isolated).toBe('isolate')
  })

  test('the sort runs at frame rate', async ({ page }) => {
    await page.goto('/embed/table-sort?preset=cinematic')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.waitForTimeout(500)
    const gaps = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll('thead button')].find(b => b.textContent?.includes('Level'))! as HTMLButtonElement
      const out: number[] = []
      let last = performance.now()
      btn.click()
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const now = performance.now()
        out.push(now - last)
        last = now
      }
      return out.slice(1)
    })
    const sorted = [...gaps].sort((a, b) => a - b)
    const p90 = sorted[Math.floor(sorted.length * 0.9)]!
    expect(p90).toBeLessThan(34)
  })
})

test.describe('the drawer over the ledger', () => {
  test.use({ viewport: { width: 600, height: 800 } })
  test('on a narrow viewport the drawer covers the sticky header', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    const drawer = page.getByRole('dialog', { name: /Anchor Kaze/ })
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(1000)
    // Whatever sits on top at a header cell's centre belongs to the drawer.
    const top = await page.evaluate(() => {
      const th = document.querySelector('thead th:nth-child(3)')!.getBoundingClientRect()
      const el = document.elementFromPoint(th.left + th.width / 2, th.top + th.height / 2)
      return el?.closest('dialog') ? 'drawer' : el?.closest('thead') ? 'header' : String(el?.tagName)
    })
    expect(top).toBe('drawer')
  })
})

// A moving row's content fades out and back in, its fill staying opaque, so
// no crossing slices a row's text at another row's edge (contract; David's
// screenshots of a Name and an Industry sort, 2026-10-05). The row stack
// project runs this in WebKit too.
test.describe('the row stack during a move', () => {
  test('moving rows fade their content and keep their fill; still rows keep theirs; all return on landing', async ({ page }) => {
    await page.goto('/embed/table-sort?preset=cinematic')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.waitForTimeout(500)
    const r = await page.evaluate(async () => {
      const rows = [...document.querySelectorAll<HTMLElement>('tbody tr')]
      let faded = 0
      let fillLost = 0
      let sliced = 0
      ;([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith('Name')) as HTMLButtonElement).click()
      for (let i = 0; i < 90; i++) {
        await new Promise(r => requestAnimationFrame(r))
        for (const tr of rows) {
          const op = parseFloat(getComputedStyle(tr.querySelector('th')!).opacity)
          if (tr.hasAttribute('data-moving') && op < 0.05) faded++
          if (/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(tr).backgroundColor)) fillLost++
          if (op < 0.3) continue
          const l = tr.querySelector('th .type-label')!.getBoundingClientRect()
          const hit = (y: number) => document.elementFromPoint(l.left + 4, y)?.closest('tr') === tr
          if (hit(l.top + 2) !== hit(l.bottom - 2)) sliced++
        }
      }
      await new Promise(r => setTimeout(r, 2000))
      const after = rows.map(tr => parseFloat(getComputedStyle(tr.querySelector('th')!).opacity))
      return { faded, fillLost, sliced, after, moving: document.querySelectorAll('tbody tr[data-moving]').length }
    })
    expect(r.faded).toBeGreaterThan(0)
    expect(r.fillLost).toBe(0)
    // A landed row fading back in can meet a late mover for a frame or two.
    expect(r.sliced).toBeLessThanOrEqual(3)
    expect(r.moving).toBe(0)
    for (const op of r.after) expect(op).toBe(1)
  })
})
