import type { Page } from '@playwright/test'

// One sort by a column, sampled every frame (decisions/2026-10-21-the-sort-
// crosses-in-pairs.md). For each row that moves: where it was and where it
// goes, when its lane step shows, and when its travel starts, read as the
// first frame its Framer offset differs from the one it was put at (the
// offset itself is there from the first frame, so its presence says
// nothing). Shared by the built-output suite and tests/dev.
export type SortFrame = { name: string; dir: string; from: number; to: number; lane: number | null; travel: number | null }

export async function sortFrames(page: Page, column: string): Promise<SortFrame[]> {
  return page.evaluate(async column => {
    const rows = [...document.querySelectorAll<HTMLElement>('tbody tr')].filter(tr => tr.closest('table')!.querySelector('thead button'))
    const top = (tr: HTMLElement) => tr.getBoundingClientRect().top
    const order = () => [...rows].sort((a, b) => top(a) - top(b))
    const before = order()
    const log = new Map(rows.map(tr => [tr, { y0: null as number | null, lane: null as number | null, travel: null as number | null }]))
    const t0 = performance.now()
    ;([...document.querySelectorAll('thead button')].find(b => b.textContent?.trim().startsWith(column)) as HTMLButtonElement).click()
    for (let i = 0; i < 90; i++) {
      await new Promise(r => requestAnimationFrame(r))
      const t = Math.round(performance.now() - t0)
      for (const tr of rows) {
        const e = log.get(tr)!
        const cs = getComputedStyle(tr)
        const y = cs.transform === 'none' ? 0 : new DOMMatrix(cs.transform).m42
        if (e.y0 === null && Math.abs(y) > 0.5) e.y0 = y
        if (e.lane === null && Math.abs(parseFloat(cs.translate) || 0) > 0.3) e.lane = t
        if (e.y0 !== null && e.travel === null && Math.abs(y - e.y0) > 0.5) e.travel = t
      }
    }
    await new Promise(r => setTimeout(r, 1500))
    const after = order()
    return rows
      .filter(tr => tr.dataset['dir'] && tr.dataset['dir'] !== 'still')
      .map(tr => {
        const { lane, travel } = log.get(tr)!
        return { name: tr.querySelector('th')!.textContent!.trim(), dir: tr.dataset['dir']!, from: before.indexOf(tr), to: after.indexOf(tr), lane, travel }
      })
  }, column)
}

// Rows whose moves share a top, the smaller of old and new index, capped as
// the stagger is: they wait the same and start together. A rising row and a
// falling one that pass each other share it, which is the F1 pass.
export function pairs(frames: SortFrame[]): [SortFrame, SortFrame][] {
  const top = (f: SortFrame) => Math.min(f.from, f.to, 7)
  const out: [SortFrame, SortFrame][] = []
  frames.forEach((a, i) => frames.slice(i + 1).forEach(b => { if (top(a) === top(b)) out.push([a, b]) }))
  return out
}
