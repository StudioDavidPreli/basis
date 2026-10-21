import type { Page } from '@playwright/test'

// The line draw, frame by frame (decisions/2026-10-21-the-draw-runs-
// cinematic.md): when each ribbon's clip starts to widen and when the
// ribbon is drawn, in ms from the first start, and the charted rows in the
// ledger's order. Installed before the page's own scripts, so a landing is
// seen from its first frame. Shared by the built-output suite and tests/dev.
export type DrawFrame = { id: string; start: number; land: number }

export async function watchDraws(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __draw: Record<string, { closed: boolean; start: number | null; land: number | null }> }
    w.__draw = {}
    const tick = () => {
      const now = performance.now()
      // A draw is a clip seen closed and then opening; a ribbon already
      // drawn when watching began is not one.
      for (const r of document.querySelectorAll('[data-reveal]')) {
        const e = (w.__draw[r.getAttribute('data-reveal')!] ??= { closed: false, start: null, land: null })
        const width = parseFloat(r.getAttribute('width') ?? '0')
        if (width <= 0.5) e.closed = true
        else if (e.closed && e.start === null) e.start = now
      }
      for (const p of document.querySelectorAll('path[data-series][data-drawn]')) {
        const e = w.__draw[p.getAttribute('data-series')!]
        if (e && e.start !== null && e.land === null) e.land = now
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// The draws seen since the last call, and clears them.
export async function takeDraws(page: Page): Promise<{ ledger: string[]; draws: DrawFrame[] }> {
  return page.evaluate(() => {
    const w = window as unknown as { __draw: Record<string, { closed: boolean; start: number | null; land: number | null }> }
    const seen = Object.entries(w.__draw).filter(([, e]) => e.start !== null && e.land !== null)
    const first = Math.min(...seen.map(([, e]) => e.start!))
    const draws = seen.map(([id, e]) => ({ id, start: Math.round(e.start! - first), land: Math.round(e.land! - first) }))
    w.__draw = {}
    const ledger = [...document.querySelectorAll<HTMLElement>('tbody tr')]
      .filter(tr => tr.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map(tr => tr.querySelector('th a')?.getAttribute('href')?.split('/').pop() ?? '')
    return { ledger, draws }
  })
}
