import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The sheet lands with its dataset's `charted` rows selected
// (decisions/2026-10-15-four-rows-charted-on-landing.md). A spec about
// selecting, drawing, or the strip's empty state starts from none: land, and
// once hydrated, clear the selection through the header's own checkbox.
export async function landEmpty(page: Page, url = '/') {
  await page.goto(url)
  const rows = page.locator('tbody input[type="checkbox"]:checked')
  await expect(async () => {
    if ((await rows.count()) > 0) await page.getByRole('checkbox', { name: 'Deselect all rows' }).click()
    await expect(rows).toHaveCount(0, { timeout: 500 })
  }).toPass()
  await expect(page.locator('path[data-series]')).toHaveCount(0)
}

// The ledger waits for the graph on landing and fades in
// (decisions/2026-10-21-the-ledger-waits-for-the-draw.md). A spec that reads
// its contrast, axe above all, waits until it is whole: mid-fade its text
// is at part opacity and fails a contrast it does not have at rest. Where
// there is no ledger (a phone, an embed) there is nothing to wait for.
export async function ledgerArrived(page: Page) {
  if ((await page.locator('[data-ledger]').count()) === 0) return
  await expect(page.locator('[data-ledger]')).toHaveCSS('opacity', '1')
}

// Every axe run: once the ledger is whole.
export async function axe(page: Page): Promise<AxeBuilder> {
  await ledgerArrived(page)
  return new AxeBuilder({ page })
}
