import { expect, type Page } from '@playwright/test'

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
