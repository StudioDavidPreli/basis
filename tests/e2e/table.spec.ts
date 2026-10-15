import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { landEmpty } from './land'

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
    await expect(page.getByRole('list', { name: 'Selected rows' }).getByRole('listitem')).toHaveCount(5) // four rows + clear
    const headerBox = page.locator('thead input[type="checkbox"]')
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
})
