// The ledger's bar (M12; contracts/cadence-basis.md, "The bar follows the
// sort"): one bar per row in the sorted column, drawn from zero, so a
// length is a value and the rows can be compared at a glance. The figure
// stays the reading; the bar is the second cue. Pure.
//
// A track holds two halves that meet at zero: the negative half grows
// left from zero, the positive half right. Each half is a scale in [0, 1]
// of its own side, so a value animates as a scale about the zero point,
// and a sign change shrinks one half as the other grows.

export type BarDomain = { lo: number; hi: number } // always spans zero

// The column's extent over every row with a value, widened to take zero
// in. Null when nothing can be drawn: no values, or every value zero.
export function barDomain(values: Array<number | undefined>): BarDomain | null {
  let lo = 0
  let hi = 0
  let any = false
  for (const v of values) {
    if (v === undefined || !Number.isFinite(v)) continue
    any = true
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!any || hi === lo) return null
  return { lo, hi }
}

export type BarGeometry = {
  zero: number // where zero sits in the track, 0 (left edge) to 1 (right edge)
  negative: number // the negative half's scale, 0 to 1 of the room left of zero
  positive: number // the positive half's scale, 0 to 1 of the room right of zero
}

export function barGeometry(value: number | undefined, domain: BarDomain): BarGeometry {
  const span = domain.hi - domain.lo
  const zero = domain.lo === 0 ? 0 : -domain.lo / span
  if (value === undefined || !Number.isFinite(value)) return { zero, negative: 0, positive: 0 }
  return {
    zero,
    negative: value < 0 && domain.lo < 0 ? value / domain.lo : 0,
    positive: value > 0 && domain.hi > 0 ? value / domain.hi : 0,
  }
}
