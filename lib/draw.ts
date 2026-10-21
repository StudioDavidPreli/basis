// The line draw by rank (contracts/cadence-basis.md, "Chart line draw-in";
// decisions/2026-10-21-the-draw-runs-cinematic.md;
// decisions/2026-10-21-derived-timings.md). The ribbons drawing together
// are ranked by the ledger; with t = rank / (n − 1), a ribbon waits
// slow × t and draws for slow + (slower − slow) × t, so the top row lands
// first and the last lands at slower + slow, however many draw. One ribbon
// alone takes slow and starts at once. The ends are tokens; only the
// position between them is the data's. Pure.

export type DrawTiming = { delay: number; duration: number }

export function drawTimings(ledger: string[], arriving: string[], d: { slow: number; slower: number }): { each: Map<string, DrawTiming>; lands: number } {
  // In the ledger's order; anything the ledger does not hold keeps its
  // arrival order after it.
  const ranked = [...ledger.filter(id => arriving.includes(id)), ...arriving.filter(id => !ledger.includes(id))]
  const last = ranked.length - 1
  const each = new Map<string, DrawTiming>()
  let lands = 0
  ranked.forEach((id, rank) => {
    const t = last > 0 ? rank / last : 0
    const timing = { delay: d.slow * t, duration: d.slow + (d.slower - d.slow) * t }
    each.set(id, timing)
    lands = Math.max(lands, timing.delay + timing.duration)
  })
  return { each, lands }
}
