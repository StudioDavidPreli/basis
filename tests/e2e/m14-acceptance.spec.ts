import { test, expect, type Locator, type Page } from '@playwright/test'
import { axe } from './land'

// M14's acceptance check, the parts no step's own spec covered (plan.md,
// M14): the popover's exit on blur, the press on the controls the press
// spec does not reach, Snappy's overshoot on the embeds, and axe on M14's
// surfaces in every stock × reduced-motion combination. The rest lives with
// its step: the popover's exit on hover-out, the sort, stale, and the
// checkboxes (table.spec), the press on the sheet (press.spec), the markers
// (risk-return.spec), and the sort under Strict Mode (tests/dev).

test.beforeEach(async ({ request }) => {
  await request.post('/api/refresh')
})

async function hydrated(page: Page) {
  await page.getByRole('button', { name: 'Command palette' }).evaluate(e => new Promise<void>(done => {
    const check = () => (Object.keys(e).some(k => k.startsWith('__reactProps')) ? done() : requestAnimationFrame(check))
    check()
  }))
}

async function pressScale(page: Page, target: Locator, release: 'off' | 'on' = 'off'): Promise<string> {
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(300)
  const down = await target.evaluate(el => getComputedStyle(el).scale)
  // Slide off before release, so the press does not run the control; in a
  // modal dialog that release would land on the backdrop and close it, so
  // there the press is released on the control.
  if (release === 'off') await page.mouse.move(0, 0)
  await page.mouse.up()
  return down
}

test.describe('M14 acceptance', () => {
  test('the provenance tooltip leaves on its exit when focus leaves', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    await trigger.focus()
    await expect(page.getByRole('tooltip')).toBeVisible()
    await expect.poll(() => page.getByRole('tooltip').evaluate(el => getComputedStyle(el).opacity)).toBe('1')
    const fading = await page.evaluate(async () => {
      const seen: number[] = []
      ;(document.activeElement as HTMLElement).blur()
      for (let i = 0; i < 30; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const tip = document.querySelector('[role="tooltip"]')
        seen.push(tip ? Number(getComputedStyle(tip).opacity) : -1)
      }
      return seen
    })
    expect(fading.some(o => o > 0 && o < 1)).toBe(true)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test('the palette\'s options press', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await page.getByRole('button', { name: 'Command palette' }).click()
    const option = page.getByRole('dialog', { name: 'Command palette' }).getByRole('option').first()
    await expect(option).toBeVisible()
    expect(await pressScale(page, option)).toBe('0.98')
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })
    test('the window dialog\'s Reset and Done press', async ({ page }) => {
      await page.goto('/')
      await hydrated(page)
      await page.getByRole('button', { name: /^Analysis window/ }).click()
      const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Done' }) })
      await expect(dialog).toBeVisible()
      // Reset only clears the window; Done closes the dialog, so it goes last.
      for (const name of [/Reset to the view/, /Done/]) {
        const button = dialog.getByRole('button', { name })
        expect(await pressScale(page, button, 'on'), String(name)).toBe('0.98')
      }
    })
  })

  test.describe('on a first visit', () => {
    test.use({ storageState: { cookies: [], origins: [] } })
    test('the welcome\'s Close presses, on Cinematic\'s press', async ({ page }) => {
      await page.goto('/')
      const close = page.getByRole('dialog', { name: 'Basis, sourced-data surface' }).getByRole('button').last()
      await expect(close).toBeVisible()
      await page.waitForTimeout(1200)
      // The welcome runs Cinematic, whose pressSubtle is 0.99.
      expect(await pressScale(page, close)).toBe('0.99')
    })
  })

  test('Snappy overshoots on the embeds: a sorted row passes its slot before it settles', async ({ page }) => {
    await page.goto('/embed/table-sort?preset=snappy')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    await page.waitForTimeout(500)
    const crossed = await page.evaluate(async () => {
      const rows = [...document.querySelectorAll<HTMLElement>('tbody tr')]
      const sign = new Map<HTMLElement, number>()
      let crossed = 0
      ;([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith('Name')) as HTMLButtonElement).click()
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r))
        for (const tr of rows) {
          const t = getComputedStyle(tr).transform
          const y = t === 'none' ? 0 : new DOMMatrix(t).m42
          if (Math.abs(y) < 0.5) continue
          const s = Math.sign(y)
          if (sign.has(tr) && sign.get(tr) !== s) crossed++
          sign.set(tr, s)
        }
      }
      return crossed
    })
    expect(crossed).toBeGreaterThan(0)
  })

  for (const theme of ['passbook', 'operate'] as const) {
    for (const reduce of [false, true]) {
      test(`axe is clean on M14's surfaces: ${theme}, reduced motion ${reduce ? 'on' : 'off'}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme === 'operate' ? 'dark' : 'light', reducedMotion: reduce ? 'reduce' : 'no-preference' })
        await page.goto('/')
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await hydrated(page)
        const settle = () => page.waitForTimeout(reduce ? 100 : 1200)
        // The ledger after a sort, its checkboxes drawn on the paper.
        await page.locator('thead').getByRole('button', { name: /^Level/ }).click()
        await settle()
        expect((await (await axe(page)).analyze()).violations, 'the sorted ledger').toEqual([])
        // A pinned provenance dialog.
        await page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ }).click()
        await expect(page.getByRole('dialog', { name: 'Provenance' })).toBeVisible()
        await settle()
        expect((await (await axe(page)).analyze()).violations, 'the provenance dialog').toEqual([])
        await page.keyboard.press('Escape')
        // Risk / return with its markers arrived.
        await page.goto('/?view=risk')
        await expect(page.locator('[data-point]').first()).toBeVisible()
        await settle()
        expect((await (await axe(page)).analyze()).violations, 'Risk / return').toEqual([])
      })
    }
  }
})
