import { test, expect, type Locator, type Page } from '@playwright/test'

// Press feedback (contract, "Press feedback on buttons"; M14 step 5): a
// pressed control settles to scale.pressSubtle on fast / standard and comes
// back on release. The figure triggers read as numbers, not controls, and do
// not press. Under reduced motion the press lands in one frame.

async function pressed(page: Page, target: Locator): Promise<{ down: string; up: string }> {
  await target.scrollIntoViewIfNeeded()
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(300)
  const down = await target.evaluate(el => getComputedStyle(el).scale)
  await page.mouse.up()
  await page.waitForTimeout(300)
  const up = await target.evaluate(el => getComputedStyle(el).scale)
  return { down, up }
}

test.describe('press feedback', () => {
  test('the header, the dataset tabs, and the hero chips press and come back', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('tbody tr')).toHaveCount(12)
    const controls: [string, Locator][] = [
      ['command palette', page.getByRole('button', { name: 'Command palette' })],
      ['dataset tab', page.getByRole('navigation', { name: 'Dataset' }).getByRole('button').first()],
      ['view switch', page.getByRole('group', { name: 'Chart view' }).getByRole('button').first()],
      ['time range', page.getByRole('group', { name: 'Time range' }).getByRole('button').first()],
    ]
    for (const [name, control] of controls) {
      const { down, up } = await pressed(page, control)
      expect(down, name).toBe('0.98')
      expect(['1', 'none'], name).toContain(up)
      // The release is a click: the palette opens, and would cover the next.
      await page.keyboard.press('Escape')
    }
  })

  test('a figure trigger does not press', async ({ page }) => {
    await page.goto('/')
    const trigger = page.locator('tbody tr').first().getByRole('button', { name: /^Level for/ })
    const { down } = await pressed(page, trigger)
    expect(['1', 'none']).toContain(down)
  })

  test('under reduced motion the press lands in one frame', async ({ page }) => {
    await page.goto('/?reduce=1')
    const chip = page.getByRole('group', { name: 'Time range' }).getByRole('button').first()
    const duration = await chip.evaluate(el => {
      const cs = getComputedStyle(el)
      const props = cs.transitionProperty.split(',').map(s => s.trim())
      const durations = cs.transitionDuration.split(',').map(s => s.trim())
      return durations[props.indexOf('scale') % durations.length]
    })
    expect(duration).toBe('0.01s')
    const { down } = await pressed(page, chip)
    expect(down).toBe('0.98')
  })
})
