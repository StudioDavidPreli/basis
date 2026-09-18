import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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
      const results = await new AxeBuilder({ page }).analyze()
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

  // The third acceptance clause, and the only one that needs the artboards.
  // It is not a check that six phases look different: it is the check that
  // the zero advance is deterministic — play, advance by 0, stopRendering,
  // landing every instance on the same authored pose rather than wherever the
  // last tick fell under load (contracts/agent-presence.md). Against the text
  // fallback two runs are identical for free, so this would pass today
  // without testing anything. Unskip it in the .riv session, with the
  // artboard behind the mark.
  test.fixme('every phase holds one pose under reduced motion', async ({ page }) => {
    for (const phase of Object.keys(PHASES)) {
      await page.goto(`/embed/agent?phase=${phase}&reduce=1`)
      const mark = page.locator('[data-phase][role="img"]')
      const first = await mark.screenshot()
      await page.reload()
      const second = await mark.screenshot()
      expect(second.equals(first), `${phase} rested on two different frames`).toBe(true)
    }
  })
})
