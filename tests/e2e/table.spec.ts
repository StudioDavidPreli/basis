import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { landEmpty } from './land'
import { ONE_FRAME_MS, pairs, sortFrames } from './sort-frames'

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
    await landEmpty(page, '/')
    const boxes = page.locator('tbody input[type="checkbox"]')
    await boxes.nth(1).click()
    await boxes.nth(4).click({ modifiers: ['Shift'] })
    for (const i of [1, 2, 3, 4]) await expect(boxes.nth(i)).toBeChecked()
    await expect(boxes.nth(0)).not.toBeChecked()
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('listitem')).toHaveCount(5) // four rows and clear; export is in the diagnostics strip
    const headerBox = page.getByRole('checkbox', { name: 'Deselect all rows' })
    expect(await headerBox.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true)
  })

  test('select-all takes every row; the chart holds eight and the legend says so', async ({ page }) => {
    await landEmpty(page, '/')
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

  test('the provenance popover leaves on its exit, and a hover back takes it back', async ({ page }) => {
    // It used to be removed in one frame (adversarial pass, finding 1). Sample
    // every frame after the pointer leaves: the panel must still be there,
    // fading, before it goes; and never two panels at once.
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    await trigger.hover()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await expect.poll(() => page.getByRole('tooltip').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    await page.evaluate(() => {
      const w = window as unknown as { __tip: { opacity: number[]; most: number } }
      w.__tip = { opacity: [], most: 0 }
      const sample = () => {
        const tips = document.querySelectorAll('[role="tooltip"]')
        w.__tip.most = Math.max(w.__tip.most, tips.length)
        const tip = tips[0]
        w.__tip.opacity.push(tip ? Number(getComputedStyle(tip).opacity) : -1)
        if (w.__tip.opacity.length < 90) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.mouse.move(0, 0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    const fading = await page.evaluate(() => (window as unknown as { __tip: { opacity: number[] } }).__tip.opacity)
    expect(fading.some(o => o > 0 && o < 1)).toBe(true)

    // A hover back while it leaves takes the same panel back.
    await trigger.hover()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await page.evaluate(() => {
      const w = window as unknown as { __tip: { opacity: number[]; most: number } }
      w.__tip.most = 0
      const sample = () => {
        w.__tip.most = Math.max(w.__tip.most, document.querySelectorAll('[role="tooltip"]').length)
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await page.mouse.move(0, 0)
    await trigger.hover()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await expect.poll(() => page.getByRole('tooltip').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    expect(await page.evaluate(() => (window as unknown as { __tip: { most: number } }).__tip.most)).toBe(1)
  })

  test('the provenance panel draws over the rows after it', async ({ page }) => {
    // Rows are opaque and stack for the sort, so a panel inside one was
    // painted under the rows below (David, 2026-10-21).
    await page.goto('/')
    const trigger = page.locator('tbody tr').nth(3).getByRole('button', { name: /^Level for/ })
    await trigger.hover()
    const tip = page.getByRole('tooltip')
    await expect(tip).toBeVisible()
    const onTop = await tip.evaluate(el => {
      const r = el.getBoundingClientRect()
      const points = [0.25, 0.5, 0.75].flatMap(fx => [0.25, 0.5, 0.75].map(fy => [r.left + r.width * fx, r.top + r.height * fy] as const))
      return points.every(([x, y]) => el.contains(document.elementFromPoint(x, y)))
    })
    expect(onTop).toBe(true)
  })

  test('× and Escape close the provenance panel and leave no tooltip behind', async ({ page }) => {
    // Closing handed focus to the trigger, whose focus showed the tooltip:
    // the panel went and another came straight back (David, 2026-10-21).
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    const panels = page.locator('[role="tooltip"], [role="dialog"][aria-label="Provenance"]')
    for (const close of ['×', 'Escape']) {
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: 'Provenance' })
      await expect(dialog).toBeVisible()
      await page.mouse.move(0, 0)
      if (close === '×') await dialog.getByRole('button', { name: 'Close provenance' }).click()
      else await page.keyboard.press('Escape')
      await expect(panels, close).toHaveCount(0)
      await expect(trigger, close).toBeFocused()
      await page.waitForTimeout(300)
      await expect(panels, `${close}, after a moment`).toHaveCount(0)
      await page.mouse.move(0, 0)
    }
    // The next hover shows the tooltip as before.
    await trigger.hover()
    await expect(page.getByRole('tooltip')).toBeVisible()
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

  // The name cell's mark (contracts/agent-presence.md, "Company logos"): the
  // Marker, for every company and every region, hidden, with the row's name
  // the entity's once. The art is the drawer's: open a row and the logo box
  // sits above the heading, while the heading keeps its Marker.
  test('the name cell keeps the Marker; the art is the drawer\'s', async ({ page }) => {
    await page.goto('/')
    const cell = page.getByRole('rowheader', { name: /Anchor Kaze/ })
    await expect(cell).toHaveCount(1)
    await expect(cell.locator('svg')).toHaveCount(1)
    await expect(cell.locator('[data-artboard]')).toHaveCount(0)
    await expect(cell.locator('svg')).toHaveAttribute('aria-hidden', 'true')
    // Every row is a Marker row, so the bands stay even.
    const height = (name: RegExp) => page.locator('tbody tr', { has: page.getByRole('rowheader', { name }) }).evaluate(r => r.getBoundingClientRect().height)
    expect(Math.abs((await height(/Anchor Kaze/)) - (await height(/Plumb Varsha/)))).toBeLessThan(1)

    await cell.getByRole('link').click()
    const logo = page.locator('dialog [data-artboard="ou-tokyo"]')
    await expect(logo).toHaveAttribute('aria-hidden', 'true')
    await expect(page.locator('dialog [data-drawer-heading] svg')).toHaveCount(1)
    await page.goBack()

    await page.getByRole('button', { name: 'Regions' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(8)
    await expect(page.getByRole('rowheader').first().locator('svg')).toHaveCount(1)
    await expect(page.locator('tbody [data-artboard]')).toHaveCount(0)
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

test.describe('the stale fade', () => {
  test('a figure fades to stale on base / standard, not on the decay\'s timing', async ({ page }) => {
    // Stale once rode the color transition the direction decay was thought
    // to use, slower / exit, and took 600 ms (adversarial pass, finding 3).
    // Turn a current figure stale in place and sample its ink each frame.
    await page.goto('/embed/figure?status=current')
    const figure = page.locator('[data-status]').first()
    await expect(figure).toHaveAttribute('data-status', 'current')
    await page.waitForTimeout(700)
    const r = await page.evaluate(async () => {
      // The stage carries a data-status too; the figure is the span inside.
      const fig = document.querySelector<HTMLElement>('span[data-status]')!
      const trigger = fig.querySelector('button')!
      const from = getComputedStyle(trigger).color
      // Read the stale ink with the transition off, then snap back.
      trigger.style.transition = 'none'
      fig.setAttribute('data-status', 'stale')
      const target = getComputedStyle(trigger).color
      fig.setAttribute('data-status', 'current')
      void trigger.offsetWidth // flush the snap back before the transition returns
      trigger.style.transition = ''
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const t0 = performance.now()
      fig.setAttribute('data-status', 'stale')
      let landed: number | null = null
      let between = 0
      for (let i = 0; i < 60 && landed === null; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const c = getComputedStyle(trigger).color
        if (c === target) landed = performance.now() - t0
        else if (c !== from) between++
      }
      return { from, target, landed, between }
    })
    expect(r.target).not.toBe(r.from)
    expect(r.between).toBeGreaterThan(0)
    expect(r.landed).not.toBeNull()
    // base is 200 ms on Standard; slower, the old timing, is 600.
    expect(r.landed!).toBeLessThan(350)
  })
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
  test('every row is opaque, the bands are the even rows, and a sort stacks rising over still over falling', async ({ page }) => {
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
    // Rising over still over falling; within a direction, the shorter move higher.
    const group = (from: number, to: number) => (to < from ? 2 : to === from ? 1 : 0)
    const moves = r.names.map((name, i) => ({ g: group(before.indexOf(name), i), distance: Math.abs(i - before.indexOf(name)), level: r.levels[i]! }))
    for (const a of moves)
      for (const b of moves) {
        if (a.g > b.g) expect(a.level).toBeGreaterThan(b.level)
        if (a.g === b.g && a.distance < b.distance) expect(a.level).toBeGreaterThan(b.level)
      }
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
  // A tablet: the ledger is on the page and the drawer is full width. On a
  // phone the ledger is the Inputs sheet, which steps aside for the drawer.
  test.use({ viewport: { width: 700, height: 800 } })
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

// On a sort a rising row steps a lane left and lifts, a falling row steps a
// lane right, and both step back on landing; rising rows stack over still
// rows over falling rows; text stays (contract; the F1 timing tower and
// Scott Logic's ranking tables, 2026-10-05). The row stack project runs this
// in WebKit too.
test.describe('the row stack during a move', () => {
  test('rising rows lift into the left lane, falling rows take the right, the stack is rising over still over falling, and all return', async ({ page }) => {
    await page.goto('/embed/table-sort?preset=cinematic')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.waitForTimeout(500)
    const r = await page.evaluate(async () => {
      const rows = [...document.querySelectorAll<HTMLElement>('tbody tr')]
      const wrap = document.querySelector('table')!.parentElement!
      let lifted = 0
      let rightLane = 0
      let wrongStack = 0
      let hidden = 0
      let clipLifted = false
      ;([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith('Name')) as HTMLButtonElement).click()
      for (let i = 0; i < 90; i++) {
        await new Promise(r => requestAnimationFrame(r))
        if (wrap.hasAttribute('data-sorting')) clipLifted = true
        for (const tr of rows) {
          const cs = getComputedStyle(tr)
          const moving = tr.hasAttribute('data-moving')
          if (moving && tr.dataset['dir'] === 'up' && parseFloat(cs.scale) > 1.001 && parseFloat(cs.translate) < -0.5) lifted++
          if (moving && tr.dataset['dir'] === 'down' && parseFloat(cs.translate) > 0.5) rightLane++
          if (parseFloat(getComputedStyle(tr.querySelector('th')!).opacity) < 0.99) hidden++
        }
        const z = (d: string) => rows.filter(tr => tr.dataset['dir'] === d).map(tr => Number(getComputedStyle(tr).zIndex))
        const [up, still, down] = [z('up'), z('still'), z('down')]
        if (up.length && still.length && Math.min(...up) < Math.max(...still)) wrongStack++
        if (still.length && down.length && Math.min(...still) < Math.max(...down)) wrongStack++
        if (up.length && down.length && Math.min(...up) < Math.max(...down)) wrongStack++
      }
      await new Promise(r => setTimeout(r, 3000))
      const offLane = rows.filter(tr => {
        const cs = getComputedStyle(tr)
        return Math.abs(parseFloat(cs.translate) || 0) > 0.1 || Math.abs((parseFloat(cs.scale) || 1) - 1) > 0.001
      }).length
      return { lifted, rightLane, wrongStack, hidden, clipLifted, clipBack: !wrap.hasAttribute('data-sorting'), offLane, moving: document.querySelectorAll('tbody tr[data-moving]').length }
    })
    expect(r.lifted).toBeGreaterThan(0)
    expect(r.rightLane).toBeGreaterThan(0)
    expect(r.wrongStack).toBe(0)
    // Text stays visible: nothing fades.
    expect(r.hidden).toBe(0)
    expect(r.clipLifted).toBe(true)
    expect(r.clipBack).toBe(true)
    expect(r.offLane).toBe(0)
    expect(r.moving).toBe(0)
  })

  test('a row steps into its lane as its travel starts, and rows that trade places start together', async ({ page }) => {
    // The lane step once fired before the stagger delay: the last row sat
    // sideways 384 ms before it moved, and every rising row went before any
    // falling one (adversarial pass, finding 2).
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    // The landing draw runs 2.3 s on Cinematic; sort once it has landed, so
    // the sort is measured alone.
    await expect(page.locator('path[data-series]:not([data-drawn])')).toHaveCount(0)
    const frames = await sortFrames(page, 'Level')
    expect(frames.length).toBeGreaterThan(2)
    for (const f of frames) {
      expect(f.lane, f.name).not.toBeNull()
      expect(f.travel, f.name).not.toBeNull()
      // Within a frame or two: the lane's first sub-pixel shows a frame
      // before the travel's.
      expect(Math.abs(f.travel! - f.lane!), f.name).toBeLessThanOrEqual(34)
    }
    const crossing = pairs(frames)
    expect(crossing.length).toBeGreaterThan(0)
    for (const [a, b] of crossing) expect(Math.abs(a.travel! - b.travel!), `${a.name} and ${b.name}`).toBeLessThanOrEqual(ONE_FRAME_MS)
    // The first wave holds a rising row and a falling one.
    const first = (dir: string) => Math.min(...frames.filter(f => f.dir === dir).map(f => f.travel!))
    expect(Math.abs(first('up') - first('down'))).toBeLessThanOrEqual(ONE_FRAME_MS)
  })
})

// The bar follows the sort (M12; contracts/cadence-basis.md, "The bar
// follows the sort"): the sorted figure column fills its tracks, drawn from
// zero, and a column the sort leaves retracts. Every figure column keeps
// its track, so the columns never reflow when the sort moves.
async function barColumns(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const heads = [...document.querySelectorAll('thead th')]
    const cols = (state: string) => [...new Set([...document.querySelectorAll(`tbody [data-bar="${state}"]`)].map(b => heads[(b.closest('td') as HTMLTableCellElement).cellIndex]!.textContent!.replace(/[▴▾▵]/g, '').trim()))]
    return { on: cols('on'), off: cols('off'), count: document.querySelectorAll('tbody [data-bar="on"]').length }
  })
}
async function clickHeader(page: import('@playwright/test').Page, col: string) {
  await page.evaluate(col => ([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith(col)) as HTMLButtonElement).click(), col)
}
// Where each row's bar ends, as a fraction of its track (negative left of
// zero), once the scale has landed.
async function barEnds(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('tbody [data-bar="on"]')].map(bar => {
      const track = bar.getBoundingClientRect()
      const [neg, pos] = [...bar.querySelectorAll('span')].slice(-2).map(h => h.getBoundingClientRect())
      return Math.round(((pos!.width - neg!.width) / track.width) * 1000) / 1000
    }),
  )
}

test.describe('the ledger bar', () => {
  test('lives in the sorted figure column and moves with the sort', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    expect((await barColumns(page)).count).toBe(0)
    // An idle ledger mounts no animated halves: landing pays nothing for
    // bars it is not showing (Safari's draw-in started ~40 ms late when it
    // did, David 2026-10-19).
    await expect(page.locator('tbody [data-bar] span')).toHaveCount(0)
    await clickHeader(page, 'Δ 1d')
    await expect.poll(async () => (await barColumns(page)).on).toEqual(['Δ 1d'])
    expect((await barColumns(page)).count).toBe(12)
    expect((await barColumns(page)).off.sort()).toEqual(['EV/EBITDA', 'Level'])
    const width = await page.locator('thead th', { hasText: 'EV/EBITDA' }).evaluate(th => th.getBoundingClientRect().width)
    await clickHeader(page, 'Level')
    await expect.poll(async () => (await barColumns(page)).on).toEqual(['Level'])
    // The track was always there: the sort moved no column's width.
    expect(await page.locator('thead th', { hasText: 'EV/EBITDA' }).evaluate(th => th.getBoundingClientRect().width)).toBe(width)
    await clickHeader(page, 'Name')
    await expect.poll(async () => (await barColumns(page)).count).toBe(0)
  })

  test('draws each value from zero, in proportion, with the figure beside it', async ({ page }) => {
    await page.goto('/?sort=change&dir=desc&reduce=1')
    await expect(page.locator('tbody [data-bar="on"]')).toHaveCount(12)
    const values = await page.evaluate(() =>
      [...document.querySelectorAll('tbody tr')].map(tr => {
        const text = tr.querySelectorAll('td')[[...document.querySelectorAll('thead th')].findIndex(th => th.textContent?.includes('Δ 1d')) - 1]!.textContent!
        const m = text.match(/\(?([\d,.]+)\)?\s*bps/)!
        return (text.includes('(') ? -1 : 1) * Number(m[1]!.replace(/,/g, ''))
      }),
    )
    const lo = Math.min(0, ...values)
    const hi = Math.max(0, ...values)
    const want = values.map(v => v / (hi - lo))
    await expect.poll(async () => Math.max(...(await barEnds(page)).map((e, i) => Math.abs(e - want[i]!)))).toBeLessThan(0.01)
  })

  test('every row draws from one zero rule, whatever its figure\'s width', async ({ page }) => {
    await page.goto('/?sort=change&dir=desc&reduce=1')
    await expect(page.locator('tbody [data-bar="on"]')).toHaveCount(12)
    const zeros = await page.evaluate(() =>
      [...document.querySelectorAll('tbody [data-bar="on"]')].map(bar => {
        const [neg, pos] = [...bar.querySelectorAll('span')].slice(-2).map(h => h.getBoundingClientRect())
        return Math.round(neg!.right === neg!.left ? pos!.left : neg!.right)
      }),
    )
    expect(new Set(zeros).size).toBe(1)
  })

  test('a keep box holds a column\'s bars through another sort, in the URL and across a reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.getByRole('checkbox', { name: 'Keep bars on Δ 1d' }).check()
    await expect.poll(async () => (await barColumns(page)).on).toEqual(['Δ 1d'])
    await clickHeader(page, 'Level')
    await expect.poll(async () => (await barColumns(page)).on).toEqual(['Level', 'Δ 1d'])
    await expect(page).toHaveURL('/?sort=level&bars=change')
    await page.reload()
    await expect(page.getByRole('checkbox', { name: 'Keep bars on Δ 1d' })).toBeChecked()
    await expect.poll(async () => (await barColumns(page)).on).toEqual(['Level', 'Δ 1d'])
    await page.getByRole('checkbox', { name: 'Keep bars on Δ 1d' }).uncheck()
    await expect.poll(async () => (await barColumns(page)).on).toEqual(['Level'])
    await expect(page).toHaveURL('/?sort=level')
  })

  test('the bars give way to the drawer and fade back when it closes', async ({ page }) => {
    await page.goto('/?sort=change&dir=desc')
    await expect(page.locator('tbody [data-bar="on"]')).toHaveCount(12)
    const shown = () => page.evaluate(() => [...document.querySelectorAll('tbody [data-bar="on"]')].filter(b => getComputedStyle(b).display !== 'none').length)
    await expect.poll(shown).toBe(12)
    await page.getByRole('link', { name: /Anchor Kaze/ }).click()
    await expect(page.getByRole('dialog', { name: /Anchor Kaze/ })).toBeVisible()
    await expect.poll(shown).toBe(0)
    // Watch the first track from the close: it returns faded, then whole.
    const opacities = await page.evaluate(async () => {
      ;(document.querySelector('dialog[open] button[aria-label^="Close"]') as HTMLButtonElement).click()
      const seen: number[] = []
      for (let i = 0; i < 120; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const bar = document.querySelector('tbody [data-bar="on"]')!
        if (getComputedStyle(bar).display !== 'none') seen.push(Number(getComputedStyle(bar).opacity))
      }
      return seen
    })
    expect(opacities.length).toBeGreaterThan(0)
    expect(Math.min(...opacities)).toBeLessThan(1)
    expect(opacities[opacities.length - 1]).toBe(1)
    await expect(page).toHaveURL('/?sort=change&dir=desc')
  })

  test('the ledger with bars passes axe', async ({ page }) => {
    await page.goto('/?sort=level&dir=desc&bars=change')
    await expect(page.locator('tbody [data-bar="on"]')).toHaveCount(24)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})

// Checkboxes on the paper (M14 step 7): the real input, drawn in the
// stock's own paper and ink, with a boundary a reader can see.
test.describe('checkboxes on the paper', () => {
  for (const theme of ['passbook', 'operate']) {
    test(`are drawn in the ${theme} stock and still behave as checkboxes`, async ({ page }) => {
      // The sheet takes its stock from the header's switch, not the URL.
      await page.goto('/')
      if (theme === 'operate') await page.getByRole('button', { name: 'Switch to the dark stock' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.waitForTimeout(400)
      const r = await page.evaluate(() => {
        const lum = (c: string) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
        }
        const ratio = (a: string, b: string) => {
          const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
          return (x! + 0.05) / (y! + 0.05)
        }
        const paper = getComputedStyle(document.body).backgroundColor
        const box = [...document.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')].find(b => !b.checked)!
        const cs = getComputedStyle(box)
        return { appearance: cs.appearance, fill: cs.backgroundColor, paper, boundary: ratio(cs.borderTopColor, paper) }
      })
      expect(r.appearance).toBe('none')
      expect(r.fill).toBe(r.paper)
      expect(r.boundary).toBeGreaterThanOrEqual(3)
      const box = page.locator('tbody tr').nth(1).getByRole('checkbox')
      const was = await box.isChecked()
      await box.focus()
      await page.keyboard.press('Space')
      await expect(box).toBeChecked({ checked: !was })
      const results = await new AxeBuilder({ page }).include('table').analyze()
      expect(results.violations).toEqual([])
    })
  }
})
