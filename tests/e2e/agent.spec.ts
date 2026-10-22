import { test, expect } from '@playwright/test'
import { axe } from './land'

// M7 acceptance, the half that does not need an artboard
// (contracts/agent-presence.md, "Acceptance"): the label on every phase, and
// axe on the stage that shows them. The stage fakes nothing and needs no
// BASIS_FIXTURES gate — the component is handed a prop
// (decisions/2026-09-18-phases-through-an-embed-route.md).

const PHASES = {
  idle: 'Agent idle',
  reading: 'Agent reading sources',
  building: 'Agent building',
  waiting: 'Agent waiting for a manual refresh',
  done: 'Agent done',
  error: 'Agent error',
} as const

test.describe('the agent mark, one phase at a time', () => {
  for (const [phase, label] of Object.entries(PHASES)) {
    test(`${phase} is labelled and passes axe`, async ({ page }) => {
      await page.goto(`/embed/agent?phase=${phase}&reduce=1`)
      const mark = page.getByRole('img', { name: label })
      await expect(mark).toBeVisible()
      await expect(mark).toHaveAttribute('data-phase', phase)
      // The label names the phase and never a count of sources
      // (decisions/2026-09-18-coarse-agent-progress.md).
      expect(label).not.toMatch(/\d/)
      const results = await (await axe(page)).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('reduced motion reaches the mark, and an unknown phase is idle', async ({ page }) => {
    await page.goto('/embed/agent?phase=reading&reduce=1')
    const mark = page.locator('[data-phase][role="img"]')
    await expect(mark).toHaveAttribute('data-reduced', 'true')
    await expect(mark).toHaveAttribute('data-progress', '0')
    await page.goto('/embed/agent?phase=reading')
    await expect(page.locator('[data-phase][role="img"]')).not.toHaveAttribute('data-reduced', 'true')
    // Not a phase: the stage falls back rather than rendering an undefined
    // label, which would read as "Agent undefined" to a screen reader.
    await page.goto('/embed/agent?phase=nonsense')
    await expect(page.getByRole('img', { name: 'Agent idle' })).toBeVisible()
  })
})
